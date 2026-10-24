// Passwords and secret tokens. Only Web Crypto, which Workers provide.

const enc = new TextEncoder();

// Workers Free allows 10 ms of CPU per request, and PBKDF2 at 100,000
// iterations takes about 12 ms, so 40,000 (~5 ms). Each hash records its own
// count: raise this on a paid plan and old hashes upgrade at their next login.
export const ITERATIONS = 40_000;

export function randomToken(bytes = 32) {
  return toBase64(crypto.getRandomValues(new Uint8Array(bytes)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2$${ITERATIONS}$${toBase64(salt)}$${toBase64(hash)}`;
}

export async function verifyPassword(password, stored) {
  const [scheme, iterations, salt, hash] = (stored || "").split("$");
  if (scheme !== "pbkdf2") return false;
  const actual = await pbkdf2(password, fromBase64(salt), Number(iterations));
  const expected = fromBase64(hash);
  return actual.length === expected.length && crypto.subtle.timingSafeEqual(actual, expected);
}

export function needsRehash(stored) {
  return Number((stored || "").split("$")[1]) < ITERATIONS;
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

function toBase64(bytes) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(text) {
  return Uint8Array.from(atob(text || ""), (c) => c.charCodeAt(0));
}
