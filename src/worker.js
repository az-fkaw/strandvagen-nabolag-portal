// The server: a small JSON API under /api/ for the pages in public/.
// Every rule about who may see or change what lives in this file; the
// ROUTES table below is the whole list of what the pages can ask for.
// Messages meant for people are Norwegian, code and comments English.

import config from "../portal.config.js";
import { hashPassword, needsRehash, randomToken, sha256, verifyPassword } from "./crypto.js";

const COOKIE = "nabolag_okt";
const DAY_MS = 86_400_000;
const MAX_FAILED_LOGINS = 10; // per house, then locked for LOCK_MINUTES
const LOCK_MINUTES = 15;
const POSTS_PER_PAGE = 20;

// [method, path, who may call it, handler]. "alle" = anyone, "hus" = any
// logged-in house, "admin" = an administrator.
const ROUTES = [
  ["GET", "/api/config", "alle", getConfig],
  ["POST", "/api/setup", "alle", setup],
  ["POST", "/api/login", "alle", login],
  ["POST", "/api/logout", "alle", logout],
  ["GET", "/api/invite/:token", "alle", getInvite],
  ["POST", "/api/invite/:token", "alle", acceptInvite],
  ["POST", "/api/password", "hus", changePassword],

  ["GET", "/api/posts", "hus", listPosts],
  ["POST", "/api/posts", "hus", createPost],
  ["PUT", "/api/posts/:id", "hus", updatePost],
  ["DELETE", "/api/posts/:id", "hus", deletePost],
  ["PUT", "/api/posts/:id/pin", "admin", pinPost],
  ["POST", "/api/posts/:id/comments", "hus", createComment],
  ["DELETE", "/api/comments/:id", "hus", deleteComment],

  ["GET", "/api/events", "hus", listEvents],
  ["POST", "/api/events", "hus", createEvent],
  ["PUT", "/api/events/:id", "hus", updateEvent],
  ["DELETE", "/api/events/:id", "hus", deleteEvent],
  ["PUT", "/api/events/:id/rsvp", "hus", rsvp],

  ["GET", "/api/houses", "hus", listHouses],
  ["PUT", "/api/houses/:id", "hus", updateHouse],
  ["POST", "/api/houses", "admin", createHouses],
  ["POST", "/api/houses/:id/invite", "admin", createInvite],
  ["DELETE", "/api/houses/:id", "admin", deleteHouse],

  ["GET", "/api/links", "hus", listLinks],
  ["POST", "/api/links", "admin", createLink],
  ["PUT", "/api/links/:id", "admin", updateLink],
  ["DELETE", "/api/links/:id", "admin", deleteLink],

  ["PUT", "/api/settings", "admin", updateSettings],
].map(([method, path, access, handler]) => ({
  method,
  access,
  handler,
  pattern: new RegExp(`^${path.replace(/:(\w+)/g, "(?<$1>[^/]+)")}$`),
}));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return env.ASSETS.fetch(request);
    try {
      return await route(request, env, url);
    } catch (err) {
      if (err instanceof HttpError) return json({ error: err.message }, err.status);
      if (String(err?.message).includes("UNIQUE constraint failed: houses.name"))
        return json({ error: "Det finnes allerede et hus med dette navnet." }, 409);
      console.error(err);
      return json({ error: "Noe gikk galt på serveren. Prøv igjen om litt." }, 500);
    }
  },
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function route(request, env, url) {
  let pathMatched = false;
  for (const r of ROUTES) {
    const match = url.pathname.match(r.pattern);
    if (!match) continue;
    pathMatched = true;
    if (r.method !== request.method) continue;

    if (request.method !== "GET") checkSameOrigin(request, url);
    const me = await currentHouse(request, env);
    if (r.access !== "alle" && !me) throw new HttpError(401, "Du må logge inn.");
    if (r.access === "admin" && !me.is_admin)
      throw new HttpError(403, "Bare administratoren kan gjøre dette.");

    const body = ["POST", "PUT"].includes(request.method) ? await readJson(request) : {};
    const result = await r.handler({ request, env, url, me, body, params: match.groups || {} });
    return result instanceof Response ? result : json(result ?? { ok: true });
  }
  throw pathMatched
    ? new HttpError(405, "Denne handlingen er ikke tillatt her.")
    : new HttpError(404, "Fant ikke det du lette etter.");
}

// A form on another site cannot send JSON, and a browser always says where
// a request comes from: together they stop other sites acting as a house.
function checkSameOrigin(request, url) {
  const origin = request.headers.get("Origin");
  if (origin && origin !== url.origin) throw new HttpError(403, "Forespørselen kom fra en annen side.");
  if (!(request.headers.get("Content-Type") || "").includes("application/json"))
    throw new HttpError(415, "Forespørselen må være JSON.");
}

async function readJson(request) {
  if (Number(request.headers.get("Content-Length")) > 100_000)
    throw new HttpError(413, "Teksten er for lang.");
  try {
    const data = await request.json();
    if (data && typeof data === "object") return data;
  } catch {}
  throw new HttpError(400, "Ugyldig forespørsel.");
}

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

const now = () => new Date().toISOString();

// ---------------------------------------------------------------- input

function text(value, label, { max = 200, required = false } = {}) {
  const s = typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim() : "";
  if (required && !s) throw new HttpError(400, `${label} må fylles ut.`);
  if (s.length > max) throw new HttpError(400, `${label} kan ha høyst ${max} tegn.`);
  return s;
}

function newPassword(value) {
  const s = typeof value === "string" ? value : "";
  if (s.length < 8) throw new HttpError(400, "Passordet må ha minst 8 tegn.");
  if (s.length > 200) throw new HttpError(400, "Passordet er for langt.");
  return s;
}

function categoryId(value, categories) {
  if (!categories.some((c) => c.id === value)) throw new HttpError(400, "Velg en kategori.");
  return value;
}

function dateText(value, label, required = false) {
  const s = typeof value === "string" ? value.trim() : "";
  if (!s && !required) return "";
  const d = new Date(`${s}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s)
    throw new HttpError(400, `${label} må være en gyldig dato.`);
  return s;
}

function timeText(value, label) {
  const s = typeof value === "string" ? value.trim() : "";
  if (s && !/^([01]\d|2[0-3]):[0-5]\d$/.test(s)) throw new HttpError(400, `${label} må være et klokkeslett.`);
  return s;
}

// People type "yr.no", "116117" or "post@lag.no"; store a working link.
function linkUrl(value) {
  let s = text(value, "Adressen", { required: true, max: 500 });
  if (/^\+?[\d\s]{3,}$/.test(s)) s = `tel:${s.replace(/\s/g, "")}`;
  else if (/^[^@\s/:]+@[^@\s/]+\.[^@\s/]+$/.test(s)) s = `mailto:${s}`;
  else if (!/^[a-z][a-z+.-]*:/i.test(s)) s = `https://${s}`;
  let u;
  try {
    u = new URL(s);
  } catch {
    throw new HttpError(400, "Adressen ser ikke riktig ut.");
  }
  if (!["http:", "https:", "mailto:", "tel:"].includes(u.protocol))
    throw new HttpError(400, "Adressen må være en nettside, et telefonnummer eller en e-postadresse.");
  return u.href;
}

const idParam = (params) => Number(params.id) || 0;

function mustOwn(me, row, what) {
  if (!row) throw new HttpError(404, `Fant ikke ${what}. Kanskje noen har slettet det?`);
  if (row.house_id !== me.id && !me.is_admin)
    throw new HttpError(403, `Du kan bare endre ${what} som ditt hus har laget.`);
}

// ------------------------------------------------------- login & sessions

async function currentHouse(request, env) {
  const token = readCookie(request, COOKIE);
  if (!token) return null;
  return env.DB.prepare(
    `SELECT h.id, h.name, h.is_admin FROM sessions s JOIN houses h ON h.id = s.house_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(await sha256(token), now())
    .first();
}

function readCookie(request, name) {
  for (const part of (request.headers.get("Cookie") || "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return v.join("=");
  }
  return null;
}

function cookieHeader(url, value, maxAgeSeconds) {
  const secure = url.protocol === "https:" ? "; Secure" : ""; // http only on a local test run
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure}`;
}

async function startSession(env, url, houseId, data = { ok: true }) {
  const token = randomToken();
  const expires = new Date(Date.now() + config.sessionDays * DAY_MS).toISOString();
  await env.DB.batch([
    env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now()),
    env.DB.prepare("INSERT INTO sessions (token_hash, house_id, expires_at) VALUES (?, ?, ?)").bind(
      await sha256(token),
      houseId,
      expires,
    ),
  ]);
  return json(data, 200, { "Set-Cookie": cookieHeader(url, token, config.sessionDays * 86_400) });
}

async function readSettings(env) {
  const { results } = await env.DB.prepare("SELECT key, value FROM settings").all();
  const settings = { ...config.defaults };
  for (const row of results) if (row.key in settings) settings[row.key] = row.value;
  return settings;
}

async function getConfig({ env, me }) {
  const settings = await readSettings(env);
  const out = {
    name: settings.name,
    tagline: settings.tagline,
    theme: settings.theme,
    themes: config.themes,
    inviteDays: config.inviteDays,
    me: me && { id: me.id, name: me.name, isAdmin: !!me.is_admin },
  };
  if (me) {
    out.welcome = settings.welcome;
    out.postCategories = config.postCategories;
    out.eventCategories = config.eventCategories;
  } else {
    const { results } = await env.DB.prepare(
      "SELECT id, name FROM houses WHERE password_hash IS NOT NULL",
    ).all();
    out.houses = results;
    out.needsSetup = !(await env.DB.prepare("SELECT 1 FROM houses LIMIT 1").first());
  }
  return out;
}

// The very first visit creates the administrator's house. It works only
// while the portal has no houses at all.
async function setup({ env, url, body }) {
  const name = text(body.house, "Navnet på huset", { required: true, max: 60 });
  const hash = await hashPassword(newPassword(body.password));
  const res = await env.DB.prepare(
    "INSERT INTO houses (name, is_admin, password_hash) SELECT ?, 1, ? WHERE NOT EXISTS (SELECT 1 FROM houses)",
  )
    .bind(name, hash)
    .run();
  if (!res.meta.changes) throw new HttpError(409, "Portalen er allerede satt opp. Logg inn i stedet.");
  if (config.starterLinks.length)
    await env.DB.batch(
      config.starterLinks.map((l) =>
        env.DB.prepare("INSERT INTO links (grp, title, url, description) VALUES (?, ?, ?, ?)").bind(
          l.group,
          l.title,
          l.url,
          l.description,
        ),
      ),
    );
  return startSession(env, url, res.meta.last_row_id);
}

async function login({ env, url, body }) {
  const house = await env.DB.prepare(
    "SELECT id, password_hash, failed_logins, locked_until FROM houses WHERE id = ?",
  )
    .bind(Number(body.houseId) || 0)
    .first();
  if (!house?.password_hash) throw new HttpError(400, "Velg huset ditt fra listen.");
  if (house.locked_until && house.locked_until > now())
    throw new HttpError(429, `For mange feil forsøk. Vent ${LOCK_MINUTES} minutter og prøv igjen.`);

  const password = typeof body.password === "string" ? body.password : "";
  if (!(await verifyPassword(password, house.password_hash))) {
    const failed = house.failed_logins + 1;
    const locked = failed >= MAX_FAILED_LOGINS;
    await env.DB.prepare("UPDATE houses SET failed_logins = ?, locked_until = ? WHERE id = ?")
      .bind(locked ? 0 : failed, locked ? new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString() : null, house.id)
      .run();
    throw new HttpError(400, "Feil passord. Prøv igjen, eller be administratoren om en ny invitasjonslenke.");
  }

  const hash = needsRehash(house.password_hash) ? await hashPassword(password) : house.password_hash;
  await env.DB.prepare("UPDATE houses SET failed_logins = 0, locked_until = NULL, password_hash = ? WHERE id = ?")
    .bind(hash, house.id)
    .run();
  return startSession(env, url, house.id);
}

async function logout({ request, env, url }) {
  const token = readCookie(request, COOKIE);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return json({ ok: true }, 200, { "Set-Cookie": cookieHeader(url, "", 0) });
}

async function houseForInvite(env, token) {
  return env.DB.prepare("SELECT id, name FROM houses WHERE invite_hash = ? AND invite_expires > ?")
    .bind(await sha256(token), now())
    .first();
}

const INVITE_GONE = "Invitasjonslenken er brukt eller utløpt. Be administratoren om en ny.";

async function getInvite({ env, params }) {
  const house = await houseForInvite(env, params.token);
  if (!house) throw new HttpError(404, INVITE_GONE);
  return { house: house.name };
}

// Using an invitation sets the house's password and logs out every device
// that was logged in as this house: a new family moving in starts clean.
async function acceptInvite({ env, url, params, body }) {
  const house = await houseForInvite(env, params.token);
  if (!house) throw new HttpError(404, INVITE_GONE);
  const hash = await hashPassword(newPassword(body.password));
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE houses SET password_hash = ?, invite_hash = NULL, invite_expires = NULL,
       failed_logins = 0, locked_until = NULL WHERE id = ?`,
    ).bind(hash, house.id),
    env.DB.prepare("DELETE FROM sessions WHERE house_id = ?").bind(house.id),
  ]);
  return startSession(env, url, house.id);
}

async function changePassword({ request, env, me, body }) {
  const row = await env.DB.prepare("SELECT password_hash FROM houses WHERE id = ?").bind(me.id).first();
  if (!(await verifyPassword(String(body.current ?? ""), row.password_hash)))
    throw new HttpError(400, "Det nåværende passordet er feil.");
  const hash = await hashPassword(newPassword(body.password));
  const keep = await sha256(readCookie(request, COOKIE));
  await env.DB.batch([
    env.DB.prepare("UPDATE houses SET password_hash = ? WHERE id = ?").bind(hash, me.id),
    env.DB.prepare("DELETE FROM sessions WHERE house_id = ? AND token_hash != ?").bind(me.id, keep),
  ]);
}

// ------------------------------------------------------------------ wall

const POST_SELECT = `SELECT p.*, h.name AS house_name FROM posts p JOIN houses h ON h.id = p.house_id`;

async function listPosts({ env, url }) {
  const q = url.searchParams;
  const where = [];
  const args = [];
  if (q.get("category")) {
    where.push("p.category = ?");
    args.push(q.get("category"));
  }
  if (Number(q.get("house"))) {
    where.push("p.house_id = ?");
    args.push(Number(q.get("house")));
  }
  const search = (q.get("q") || "").trim().slice(0, 100);
  if (search) {
    const like = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
    where.push(`(p.body LIKE ? ESCAPE '\\' OR p.author LIKE ? ESCAPE '\\' OR h.name LIKE ? ESCAPE '\\')`);
    args.push(like, like, like);
  }
  const offset = Math.max(0, Number(q.get("offset")) || 0);
  const { results } = await env.DB.prepare(
    `${POST_SELECT} ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY p.pinned DESC, p.id DESC LIMIT ? OFFSET ?`,
  )
    .bind(...args, POSTS_PER_PAGE + 1, offset)
    .all();
  const posts = results.slice(0, POSTS_PER_PAGE);
  return { posts: await withComments(env, posts), more: results.length > POSTS_PER_PAGE };
}

async function withComments(env, posts) {
  if (!posts.length) return [];
  const { results } = await env.DB.prepare(
    `SELECT c.*, h.name AS house_name FROM comments c JOIN houses h ON h.id = c.house_id
     WHERE c.post_id IN (${posts.map(() => "?").join(",")}) ORDER BY c.id`,
  )
    .bind(...posts.map((p) => p.id))
    .all();
  return posts.map((p) => ({
    id: p.id,
    houseId: p.house_id,
    houseName: p.house_name,
    author: p.author,
    category: p.category,
    body: p.body,
    pinned: !!p.pinned,
    createdAt: p.created_at,
    editedAt: p.edited_at,
    comments: results
      .filter((c) => c.post_id === p.id)
      .map((c) => ({
        id: c.id,
        houseId: c.house_id,
        houseName: c.house_name,
        author: c.author,
        body: c.body,
        createdAt: c.created_at,
      })),
  }));
}

async function onePost(env, id) {
  const row = await env.DB.prepare(`${POST_SELECT} WHERE p.id = ?`).bind(id).first();
  if (!row) throw new HttpError(404, "Fant ikke innlegget. Kanskje noen har slettet det?");
  return (await withComments(env, [row]))[0];
}

function postFields(body) {
  return {
    body: text(body.body, "Innlegget", { required: true, max: 5000 }),
    category: categoryId(body.category, config.postCategories),
    author: text(body.author, "Navnet", { max: 60 }),
  };
}

async function createPost({ env, me, body }) {
  const f = postFields(body);
  const res = await env.DB.prepare("INSERT INTO posts (house_id, author, category, body) VALUES (?, ?, ?, ?)")
    .bind(me.id, f.author, f.category, f.body)
    .run();
  return onePost(env, res.meta.last_row_id);
}

async function updatePost({ env, me, body, params }) {
  const id = idParam(params);
  mustOwn(me, await env.DB.prepare("SELECT house_id FROM posts WHERE id = ?").bind(id).first(), "innlegget");
  const f = postFields(body);
  await env.DB.prepare("UPDATE posts SET body = ?, category = ?, author = ?, edited_at = ? WHERE id = ?")
    .bind(f.body, f.category, f.author, now(), id)
    .run();
  return onePost(env, id);
}

async function deletePost({ env, me, params }) {
  const id = idParam(params);
  mustOwn(me, await env.DB.prepare("SELECT house_id FROM posts WHERE id = ?").bind(id).first(), "innlegget");
  await env.DB.prepare("DELETE FROM posts WHERE id = ?").bind(id).run();
}

async function pinPost({ env, body, params }) {
  const id = idParam(params);
  await env.DB.prepare("UPDATE posts SET pinned = ? WHERE id = ?").bind(body.pinned ? 1 : 0, id).run();
  return onePost(env, id);
}

async function createComment({ env, me, body, params }) {
  const id = idParam(params);
  await onePost(env, id); // 404 if the post is gone
  await env.DB.prepare("INSERT INTO comments (post_id, house_id, author, body) VALUES (?, ?, ?, ?)")
    .bind(id, me.id, text(body.author, "Navnet", { max: 60 }), text(body.body, "Kommentaren", { required: true, max: 2000 }))
    .run();
  return onePost(env, id);
}

async function deleteComment({ env, me, params }) {
  const row = await env.DB.prepare("SELECT house_id, post_id FROM comments WHERE id = ?").bind(idParam(params)).first();
  mustOwn(me, row, "kommentaren");
  await env.DB.prepare("DELETE FROM comments WHERE id = ?").bind(idParam(params)).run();
  return onePost(env, row.post_id);
}

// -------------------------------------------------------------- calendar

// A year back is enough for the month view; older events stay in the
// database but are not sent.
async function listEvents({ env }) {
  const { results } = await env.DB.prepare(
    `SELECT e.*, h.name AS house_name FROM events e JOIN houses h ON h.id = e.house_id
     WHERE MAX(e.start_date, e.end_date) >= date('now', '-1 year')
     ORDER BY e.start_date, e.start_time, e.id`,
  ).all();
  return { events: await withRsvps(env, results) };
}

async function withRsvps(env, events) {
  if (!events.length) return [];
  const { results } = await env.DB.prepare(
    `SELECT r.event_id, h.id, h.name FROM event_rsvps r JOIN houses h ON h.id = r.house_id
     WHERE r.event_id IN (${events.map(() => "?").join(",")}) ORDER BY h.name`,
  )
    .bind(...events.map((e) => e.id))
    .all();
  return events.map((e) => ({
    id: e.id,
    houseId: e.house_id,
    houseName: e.house_name,
    title: e.title,
    category: e.category,
    startDate: e.start_date,
    startTime: e.start_time,
    endDate: e.end_date,
    endTime: e.end_time,
    location: e.location,
    description: e.description,
    going: results.filter((r) => r.event_id === e.id).map((r) => ({ id: r.id, name: r.name })),
  }));
}

async function oneEvent(env, id) {
  const row = await env.DB.prepare(
    "SELECT e.*, h.name AS house_name FROM events e JOIN houses h ON h.id = e.house_id WHERE e.id = ?",
  )
    .bind(id)
    .first();
  if (!row) throw new HttpError(404, "Fant ikke aktiviteten. Kanskje noen har slettet den?");
  return (await withRsvps(env, [row]))[0];
}

function eventFields(body) {
  const startDate = dateText(body.startDate, "Datoen", true);
  let endDate = dateText(body.endDate, "Sluttdatoen");
  if (endDate === startDate) endDate = "";
  if (endDate && endDate < startDate) throw new HttpError(400, "Sluttdatoen kan ikke være før startdatoen.");
  const startTime = timeText(body.startTime, "Starttiden");
  const endTime = startTime ? timeText(body.endTime, "Sluttiden") : "";
  if (!endDate && endTime && endTime < startTime)
    throw new HttpError(400, "Sluttiden kan ikke være før starttiden.");
  return {
    title: text(body.title, "Tittelen", { required: true, max: 120 }),
    category: categoryId(body.category, config.eventCategories),
    startDate,
    startTime,
    endDate,
    endTime,
    location: text(body.location, "Stedet", { max: 120 }),
    description: text(body.description, "Beskrivelsen", { max: 4000 }),
  };
}

async function createEvent({ env, me, body }) {
  const f = eventFields(body);
  const res = await env.DB.prepare(
    `INSERT INTO events (house_id, title, category, start_date, start_time, end_date, end_time, location, description)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(me.id, f.title, f.category, f.startDate, f.startTime, f.endDate, f.endTime, f.location, f.description)
    .run();
  return oneEvent(env, res.meta.last_row_id);
}

async function updateEvent({ env, me, body, params }) {
  const id = idParam(params);
  mustOwn(me, await env.DB.prepare("SELECT house_id FROM events WHERE id = ?").bind(id).first(), "aktiviteten");
  const f = eventFields(body);
  await env.DB.prepare(
    `UPDATE events SET title = ?, category = ?, start_date = ?, start_time = ?, end_date = ?, end_time = ?,
     location = ?, description = ? WHERE id = ?`,
  )
    .bind(f.title, f.category, f.startDate, f.startTime, f.endDate, f.endTime, f.location, f.description, id)
    .run();
  return oneEvent(env, id);
}

async function deleteEvent({ env, me, params }) {
  const id = idParam(params);
  mustOwn(me, await env.DB.prepare("SELECT house_id FROM events WHERE id = ?").bind(id).first(), "aktiviteten");
  await env.DB.prepare("DELETE FROM events WHERE id = ?").bind(id).run();
}

async function rsvp({ env, me, body, params }) {
  const id = idParam(params);
  await oneEvent(env, id);
  await env.DB.prepare(
    body.going
      ? "INSERT OR IGNORE INTO event_rsvps (event_id, house_id) VALUES (?, ?)"
      : "DELETE FROM event_rsvps WHERE event_id = ? AND house_id = ?",
  )
    .bind(id, me.id)
    .run();
  return oneEvent(env, id);
}

// ---------------------------------------------------------------- houses

async function listHouses({ env, me }) {
  const { results } = await env.DB.prepare(
    `SELECT id, name, residents, phone, email, about, is_admin,
            password_hash IS NOT NULL AS active, invite_expires
     FROM houses ORDER BY name`,
  ).all();
  return {
    houses: results.map((h) => ({
      id: h.id,
      name: h.name,
      residents: h.residents,
      phone: h.phone,
      email: h.email,
      about: h.about,
      isAdmin: !!h.is_admin,
      active: !!h.active,
      // Only the administrator needs to know whether an invitation is out.
      ...(me.is_admin && { inviteExpires: h.invite_expires }),
    })),
  };
}

const PROFILE_FIELDS = [
  ["residents", "Hvem som bor her", 200],
  ["phone", "Telefon", 40],
  ["email", "E-post", 120],
  ["about", "Om oss", 1000],
];

// A house edits its own profile; the administrator can edit any house and
// also rename it or change who is administrator.
async function updateHouse({ env, me, body, params }) {
  const id = idParam(params);
  if (id !== me.id && !me.is_admin) throw new HttpError(403, "Du kan bare endre ditt eget hus.");
  const house = await env.DB.prepare("SELECT id, is_admin FROM houses WHERE id = ?").bind(id).first();
  if (!house) throw new HttpError(404, "Fant ikke huset.");

  const updates = {};
  for (const [key, label, max] of PROFILE_FIELDS) if (key in body) updates[key] = text(body[key], label, { max });
  if (me.is_admin && "name" in body) updates.name = text(body.name, "Navnet", { required: true, max: 60 });
  if (me.is_admin && "isAdmin" in body) {
    if (!body.isAdmin && house.is_admin && (await adminCount(env)) <= 1)
      throw new HttpError(400, "Portalen må ha minst én administrator. Gjør et annet hus til administrator først.");
    updates.is_admin = body.isAdmin ? 1 : 0;
  }
  const keys = Object.keys(updates);
  if (keys.length)
    await env.DB.prepare(`UPDATE houses SET ${keys.map((k) => `${k} = ?`).join(", ")} WHERE id = ?`)
      .bind(...keys.map((k) => updates[k]), id)
      .run();
}

async function adminCount(env) {
  return (await env.DB.prepare("SELECT COUNT(*) AS n FROM houses WHERE is_admin = 1").first()).n;
}

// One name or many (one per line on the Admin page). Existing names are skipped.
async function createHouses({ env, body }) {
  const names = [...new Set((Array.isArray(body.names) ? body.names : [body.name]).map((n) => text(n, "Navnet", { max: 60 })))].filter(Boolean);
  if (!names.length) throw new HttpError(400, "Skriv navnet på minst ett hus.");
  if (names.length > 200) throw new HttpError(400, "Legg til høyst 200 hus om gangen.");
  const results = await env.DB.batch(
    names.map((n) => env.DB.prepare("INSERT OR IGNORE INTO houses (name) VALUES (?)").bind(n)),
  );
  return { added: names.filter((_, i) => results[i].meta.changes), skipped: names.filter((_, i) => !results[i].meta.changes) };
}

// A new link replaces any earlier one. The house keeps its old password
// until the new link is used.
async function createInvite({ env, url, params }) {
  const id = idParam(params);
  const token = randomToken(24);
  const expires = new Date(Date.now() + config.inviteDays * DAY_MS).toISOString();
  const res = await env.DB.prepare("UPDATE houses SET invite_hash = ?, invite_expires = ? WHERE id = ?")
    .bind(await sha256(token), expires, id)
    .run();
  if (!res.meta.changes) throw new HttpError(404, "Fant ikke huset.");
  return { url: `${url.origin}/invitasjon/${token}`, expires };
}

async function deleteHouse({ env, me, params }) {
  const id = idParam(params);
  if (id === me.id) throw new HttpError(400, "Du kan ikke slette ditt eget hus.");
  await env.DB.prepare("DELETE FROM houses WHERE id = ?").bind(id).run();
}

// ----------------------------------------------------------------- links

async function listLinks({ env }) {
  const { results } = await env.DB.prepare(
    "SELECT id, grp, title, url, description FROM links ORDER BY grp COLLATE NOCASE, title COLLATE NOCASE",
  ).all();
  return { links: results.map((l) => ({ id: l.id, group: l.grp, title: l.title, url: l.url, description: l.description })) };
}

function linkFields(body) {
  return [
    text(body.group, "Gruppen", { max: 60 }),
    text(body.title, "Tittelen", { required: true, max: 80 }),
    linkUrl(body.url),
    text(body.description, "Beskrivelsen", { max: 200 }),
  ];
}

async function createLink({ env, body }) {
  await env.DB.prepare("INSERT INTO links (grp, title, url, description) VALUES (?, ?, ?, ?)")
    .bind(...linkFields(body))
    .run();
  return listLinks({ env });
}

async function updateLink({ env, body, params }) {
  await env.DB.prepare("UPDATE links SET grp = ?, title = ?, url = ?, description = ? WHERE id = ?")
    .bind(...linkFields(body), idParam(params))
    .run();
  return listLinks({ env });
}

async function deleteLink({ env, params }) {
  await env.DB.prepare("DELETE FROM links WHERE id = ?").bind(idParam(params)).run();
  return listLinks({ env });
}

// -------------------------------------------------------------- settings

async function updateSettings({ env, body }) {
  const values = {
    name: text(body.name, "Navnet", { required: true, max: 60 }),
    tagline: text(body.tagline, "Undertittelen", { max: 120 }),
    welcome: text(body.welcome, "Velkomstteksten", { max: 2000 }),
    theme: config.themes.some((t) => t.id === body.theme) ? body.theme : config.defaults.theme,
  };
  await env.DB.batch(
    Object.entries(values).map(([key, value]) =>
      env.DB.prepare(
        "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      ).bind(key, value),
    ),
  );
}
