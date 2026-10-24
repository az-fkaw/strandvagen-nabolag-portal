// `npm test`: starts a throwaway local portal (its own empty database),
// walks through what houses and the administrator can and cannot do, and
// stops it again. Prints one line per check; exits non-zero on a failure.
import { spawn, execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;
const wrangler = join(import.meta.dirname, "..", "node_modules", ".bin", "wrangler");
const state = mkdtempSync(join(tmpdir(), "nabolag-test-"));
const env = { ...process.env, CI: "1", WRANGLER_SEND_METRICS: "false" };

execFileSync(wrangler, ["d1", "migrations", "apply", "DB", "--local", "--persist-to", state], { env, stdio: "pipe" });
const server = spawn(wrangler, ["dev", "--port", String(PORT), "--ip", "127.0.0.1", "--persist-to", state], {
  env,
  detached: true,
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

let failures = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${ok || !detail ? "" : ` -> ${detail}`}`);
  if (!ok) failures++;
}

// A browser-like client: keeps its own login cookie, sends JSON.
function client() {
  let cookie = "";
  return async (method, path, body, headers = {}) => {
    const res = await fetch(BASE + path, {
      method,
      headers: {
        ...(method !== "GET" && { "Content-Type": "application/json", Origin: BASE }),
        ...(cookie && { Cookie: cookie }),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get("set-cookie");
    if (set) cookie = set.split(";")[0].endsWith("=") ? "" : set.split(";")[0];
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  };
}

async function waitForServer() {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${BASE}/api/config`)).ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`the local server did not start:\n${serverLog}`);
}

async function run() {
  await waitForServer();
  const admin = client();
  const house = client();
  const stranger = client();
  let r;

  r = await stranger("GET", "/api/config");
  check("a new portal asks for setup", r.data.needsSetup === true && r.data.me === null);
  r = await stranger("GET", "/api/posts");
  check("the wall needs a login", r.status === 401);

  r = await admin("POST", "/api/setup", { house: "Strandvågen 1", password: "kort" });
  check("setup refuses a short password", r.status === 400);
  r = await admin("POST", "/api/setup", { house: "Strandvågen 1", password: "hemmelig123" });
  check("setup creates the administrator", r.status === 200);
  r = await stranger("POST", "/api/setup", { house: "Inntrenger", password: "hemmelig123" });
  check("setup works only once", r.status === 409);
  r = await admin("GET", "/api/config");
  check("the administrator is logged in", r.data.me?.isAdmin === true && r.data.postCategories.length > 0);

  r = await admin("POST", "/api/houses", { names: ["Strandvågen 10", "Strandvågen 2", "strandvågen 2", ""] });
  check("houses are added once each", r.data.added?.length === 2, JSON.stringify(r.data));
  const houses = (await admin("GET", "/api/houses")).data.houses;
  const h2 = houses.find((h) => h.name === "Strandvågen 2");

  r = await admin("POST", `/api/houses/${h2.id}/invite`, {});
  const token = r.data.url?.split("/invitasjon/")[1];
  check("an invitation link is made", !!token && r.data.url.startsWith(BASE));
  r = await stranger("GET", `/api/invite/${token}`);
  check("the link names its house", r.data.house === "Strandvågen 2");
  r = await house("POST", `/api/invite/${token}`, { password: "solskinn22" });
  check("the house sets its password through the link", r.status === 200);
  r = await stranger("POST", `/api/invite/${token}`, { password: "solskinn22" });
  check("a link works only once", r.status === 404);

  r = await stranger("GET", "/api/config");
  check("the login list shows only houses with a password", r.data.houses.length === 2);
  r = await stranger("POST", "/api/login", { houseId: h2.id, password: "feil-passord" });
  check("a wrong password is refused", r.status === 400);
  r = await stranger("POST", "/api/login", { houseId: h2.id, password: "solskinn22" });
  check("the right password logs in", r.status === 200);
  await stranger("POST", "/api/logout", {});
  r = await stranger("GET", "/api/config");
  check("logging out ends the session", r.data.me === null);

  r = await house("POST", "/api/posts", { body: "Noen som har en stige å låne bort?", category: "hjelp", author: "Kari" });
  const post = r.data;
  check("a house posts on the wall", r.status === 200 && post.houseName === "Strandvågen 2" && post.author === "Kari");
  r = await house("POST", "/api/posts", { body: "x", category: "finnes-ikke" });
  check("an unknown category is refused", r.status === 400);
  r = await admin("POST", `/api/posts/${post.id}/comments`, { body: "Ja, kom bort!" });
  check("another house comments", r.data.comments?.length === 1);
  const comment = r.data.comments[0];
  r = await house("DELETE", `/api/comments/${comment.id}`);
  check("a house cannot delete another house's comment", r.status === 403);
  r = await house("PUT", `/api/posts/${post.id}`, { body: "Noen som har en lang stige?", category: "hjelp", author: "Kari" });
  check("a house edits its own post", r.data.body === "Noen som har en lang stige?" && !!r.data.editedAt);
  r = await house("PUT", `/api/posts/${post.id}/pin`, { pinned: true });
  check("only the administrator pins", r.status === 403);
  r = await admin("PUT", `/api/posts/${post.id}/pin`, { pinned: true });
  check("the administrator pins", r.data.pinned === true);
  await admin("POST", "/api/posts", { body: "Husk dugnaden på lørdag!", category: "beskjed" });
  r = await house("GET", "/api/posts");
  check("pinned posts come first", r.data.posts[0].id === post.id && r.data.posts.length === 2);
  r = await house("GET", `/api/posts?category=beskjed`);
  check("the wall filters by category", r.data.posts.length === 1 && r.data.posts[0].category === "beskjed");
  r = await house("GET", `/api/posts?q=${encodeURIComponent("STIGE")}`);
  check("the wall searches", r.data.posts.length === 1 && r.data.posts[0].id === post.id);
  r = await house("GET", `/api/posts?house=${h2.id}`);
  check("the wall filters by house", r.data.posts.length === 1);

  r = await house("POST", "/api/posts", { body: "x", category: "hjelp" }, { Origin: "https://evil.example" });
  check("another site cannot post as a house", r.status === 403);
  r = await house("POST", "/api/posts", undefined, { "Content-Type": "text/plain" });
  check("a plain form cannot post", r.status === 415);

  r = await house("POST", "/api/events", {
    title: "Vårdugnad", category: "dugnad", startDate: "2027-05-01", startTime: "10:00", endTime: "14:00",
    location: "Lekeplassen", description: "Ta med rive.",
  });
  const event = r.data;
  check("a house adds an activity", r.status === 200 && event.startTime === "10:00");
  r = await house("POST", "/api/events", { title: "Feil", category: "dugnad", startDate: "2027-02-30" });
  check("an impossible date is refused", r.status === 400);
  r = await house("POST", "/api/events", { title: "Feil", category: "dugnad", startDate: "2027-05-01", startTime: "14:00", endTime: "10:00" });
  check("an end before the start is refused", r.status === 400);
  r = await admin("PUT", `/api/events/${event.id}/rsvp`, { going: true });
  check("a house says it is coming", r.data.going?.length === 1 && r.data.going[0].name === "Strandvågen 1");
  r = await admin("PUT", `/api/events/${event.id}/rsvp`, { going: false });
  check("and can take it back", r.data.going?.length === 0);
  r = await house("GET", "/api/events");
  check("the calendar lists it", r.data.events.length === 1);

  r = await house("GET", "/api/links");
  check("the starter links are there", r.data.links.length >= 1);
  r = await house("POST", "/api/links", { title: "Yr", url: "yr.no" });
  check("only the administrator adds links", r.status === 403);
  r = await admin("POST", "/api/links", { title: "Vaktmester", url: "922 33 444", group: "Kontakter" });
  check("a typed phone number becomes a call link", r.data.links.some((l) => l.url === "tel:92233444"));
  r = await admin("POST", "/api/links", { title: "Kommunen", url: "kommune.no" });
  check("a bare address becomes a web link", r.data.links.some((l) => l.url === "https://kommune.no/"));
  r = await admin("POST", "/api/links", { title: "Skummel", url: "javascript:alert(1)" });
  check("a script link is refused", r.status === 400);

  r = await house("PUT", `/api/houses/${h2.id}`, { residents: "Kari og Ola", phone: "900 00 000", name: "Hacket" });
  const me2 = (await house("GET", "/api/houses")).data.houses.find((h) => h.id === h2.id);
  check("a house edits its profile but not its name", me2.residents === "Kari og Ola" && me2.name === "Strandvågen 2");
  check("houses do not see invitation status", !("inviteExpires" in me2));
  r = await house("PUT", `/api/houses/${houses[0].id}`, { residents: "x" });
  check("a house cannot edit another house", r.status === 403);
  r = await house("POST", "/api/houses", { names: ["Nytt hus"] });
  check("a house cannot add houses", r.status === 403);

  const adminId = (await admin("GET", "/api/config")).data.me.id;
  r = await admin("PUT", `/api/houses/${adminId}`, { isAdmin: false });
  check("the last administrator cannot step down", r.status === 400);

  r = await admin("PUT", "/api/settings", { name: "Strandvågen Vel", tagline: "", welcome: "Hei!", theme: "skog" });
  r = await house("GET", "/api/config");
  check("settings reach every page", r.data.name === "Strandvågen Vel" && r.data.theme === "skog");

  r = await house("POST", "/api/password", { current: "feil-passord", password: "nyttpassord1" });
  check("changing the password needs the old one", r.status === 400);
  r = await house("POST", "/api/password", { current: "solskinn22", password: "nyttpassord1" });
  check("a house changes its password", r.status === 200);
  r = await house("GET", "/api/config");
  check("and stays logged in on this device", r.data.me?.id === h2.id);

  for (let i = 0; i < 10; i++) await stranger("POST", "/api/login", { houseId: h2.id, password: "gjetting" });
  r = await stranger("POST", "/api/login", { houseId: h2.id, password: "nyttpassord1" });
  check("ten wrong guesses lock the house for a while", r.status === 429);

  r = await admin("DELETE", `/api/houses/${h2.id}`);
  r = await admin("GET", "/api/posts");
  check("deleting a house removes its posts", r.data.posts.every((p) => p.houseId !== h2.id));
  r = await house("GET", "/api/posts");
  check("and logs it out", r.status === 401);
}

try {
  await run();
} catch (err) {
  console.error(err);
  failures++;
} finally {
  try {
    process.kill(-server.pid);
  } catch {}
  rmSync(state, { recursive: true, force: true });
}
console.log(failures ? `\n${failures} check(s) failed.` : "\nAll checks passed.");
process.exit(failures ? 1 : 0);
