// Shared helpers and small building blocks used by every page.
import { html, useEffect, useRef, useState } from "./vendor/preact-htm.js";

const TZ = "Europe/Oslo";
const LOCALE = "nb-NO";

// ---------------------------------------------------------------- server

export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: method === "GET" ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) window.dispatchEvent(new Event("nabolag:logget-ut"));
  if (!res.ok) throw new Error(data.error || "Noe gikk galt. Sjekk nettet og prøv igjen.");
  return data;
}

// A picture from the phone, shrunk to `maxSide` and saved again as JPEG,
// which also drops its hidden data (such as where it was taken). Then sent;
// the answer is { id, width, height }.
export async function sendImage(file, { maxSide, quality }) {
  let picture;
  try {
    picture = await shrink(file, maxSide, quality);
  } catch {
    throw new Error("Kunne ikke lese bildet. Prøv et annet.");
  }
  const res = await fetch(`/api/images?w=${picture.width}&h=${picture.height}`, {
    method: "POST",
    headers: { "Content-Type": "image/jpeg" },
    body: picture.blob,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Opplastingen feilet. Prøv igjen.");
  return data;
}

async function shrink(file, maxSide, quality) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff"; // see-through pictures get a white background
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", quality),
  );
  return { blob, width: canvas.width, height: canvas.height };
}

export function navigate(path) {
  if (path !== location.pathname + location.search) history.pushState(null, "", path);
  window.dispatchEvent(new Event("nabolag:naviger"));
  window.scrollTo(0, 0);
}

// localStorage can be missing (private windows); losing it only costs a convenience.
export function recall(key, fallback = "") {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}
export function remember(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

// ----------------------------------------------------------------- toasts

const toastListeners = new Set();

export function toast(message, kind = "ok") {
  const item = { id: Math.random(), message, kind };
  toastListeners.forEach((fn) => fn(item));
}
export const showError = (err) => toast(err.message, "error");

export function Toaster() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    const add = (item) => {
      setItems((xs) => [...xs, item]);
      setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== item.id)), item.kind === "error" ? 6000 : 3000);
    };
    toastListeners.add(add);
    return () => toastListeners.delete(add);
  }, []);
  return html`<div class="toasts" role="status" aria-live="polite">
    ${items.map((t) => html`<div key=${t.id} class=${`toast ${t.kind}`}>${t.message}</div>`)}
  </div>`;
}

export async function copyText(text, what = "Kopiert") {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what} ✓`);
  } catch {
    toast("Kunne ikke kopiere. Merk teksten og kopier den selv.", "error");
  }
}

// ------------------------------------------------------------ dates, times

const dayFormat = (opts) => new Intl.DateTimeFormat(LOCALE, { timeZone: "UTC", ...opts });
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// Today's date in Norway, as 'YYYY-MM-DD'.
export function todayISO() {
  return dateInNorway(new Date());
}
function dateInNorway(d) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function hourInNorway() {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
}

// Calendar dates are handled as UTC midnights so no time zone can shift them.
export const parseDay = (s) => new Date(`${s}T00:00:00Z`);
export const dayISO = (d) => d.toISOString().slice(0, 10);
export function addDays(s, n) {
  const d = parseDay(s);
  d.setUTCDate(d.getUTCDate() + n);
  return dayISO(d);
}

export function formatDay(s, opts = { weekday: "long", day: "numeric", month: "long" }) {
  return capitalize(dayFormat(opts).format(parseDay(s)));
}
export const monthName = (year, month) =>
  capitalize(dayFormat({ month: "long", year: "numeric" }).format(new Date(Date.UTC(year, month, 1))));

const relative = new Intl.RelativeTimeFormat("nb", { numeric: "auto" });

export function timeAgo(iso) {
  const secs = (Date.now() - Date.parse(iso)) / 1000;
  if (secs < 60) return "akkurat nå";
  if (secs < 3600) return relative.format(-Math.floor(secs / 60), "minute");
  if (secs < 86400) return relative.format(-Math.floor(secs / 3600), "hour");
  if (secs < 7 * 86400) return relative.format(-Math.round(secs / 86400), "day");
  const d = new Date(iso);
  const sameYear = dateInNorway(d).slice(0, 4) === todayISO().slice(0, 4);
  return new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, day: "numeric", month: "long", ...(!sameYear && { year: "numeric" }) }).format(d);
}

export const fullTime = (iso) =>
  new Intl.DateTimeFormat(LOCALE, { timeZone: TZ, dateStyle: "full", timeStyle: "short" }).format(new Date(iso));

// "Lørdag 2. mai kl. 10:00–14:00", "Lørdag 2. mai, hele dagen", ...
export function eventWhen(e) {
  const start = formatDay(e.startDate);
  if (e.endDate) {
    const end = formatDay(e.endDate).toLowerCase();
    return e.startTime
      ? `${start} kl. ${e.startTime} – ${end}${e.endTime ? ` kl. ${e.endTime}` : ""}`
      : `${start} – ${end}`;
  }
  if (!e.startTime) return `${start}, hele dagen`;
  return `${start} kl. ${e.startTime}${e.endTime ? `–${e.endTime}` : ""}`;
}

export const eventLastDay = (e) => e.endDate || e.startDate;

// ------------------------------------------------------------------ text

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"]*[^\s<>".,;:!?)\]'"]/gi;

// Text with clickable web addresses. Line breaks are kept by CSS (pre-line).
export function linkify(text) {
  const out = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    out.push(text.slice(last, m.index));
    const href = m[0].startsWith("www.") ? `https://${m[0]}` : m[0];
    out.push(html`<a href=${href} target="_blank" rel="noopener noreferrer">${m[0].replace(/^https?:\/\//, "")}</a>`);
    last = m.index + m[0].length;
  }
  out.push(text.slice(last));
  return out;
}

// Sort "Strandvågen 2" before "Strandvågen 10".
export const byName = (a, b) => a.name.localeCompare(b.name, "nb", { numeric: true });

export const byId = (list, id) => list.find((x) => x.id === id);

// ------------------------------------------------------------- components

const ICONS = {
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  users:
    '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6"/><circle cx="17" cy="9" r="2.5"/><path d="M16.5 14.2c2.8.3 5 2.3 5 5.8"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  shield: '<path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6z"/>',
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>',
  pin: '<path d="M12 17v5"/><path d="M8 3h8l-1 6 3 4H6l3-4z"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  send: '<path d="M4 12l16-8-6 16-3-7z"/>',
  logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  place: '<path d="M12 21s-7-6.3-7-12a7 7 0 0 1 14 0c0 5.7-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4H4v12h4"/>',
  share: '<path d="M12 3v12M8 7l4-4 4 4"/><path d="M5 12v8h14v-8"/>',
  download: '<path d="M12 4v11M8 11l4 4 4-4M5 20h14"/>',
  left: '<path d="M15 6l-6 6 6 6"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  grid: '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 10h18M9 10v11M15 10v11"/>',
  phone:
    '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14 9l2 2"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-9 9"/>',
};

export function Icon({ name, size = 20 }) {
  return html`<svg class="icon" width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"
    dangerouslySetInnerHTML=${{ __html: ICONS[name] }}></svg>`;
}

// The portal's mark: a roof over a wave.
export function BrandMark({ size = 36 }) {
  return html`<svg class="brand-mark" width=${size} height=${size} viewBox="0 0 32 32" aria-hidden="true">
    <rect width="32" height="32" rx="10" fill="var(--accent)" />
    <path d="M9 15l7-6 7 6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
    <path d="M7 21c2.2 0 2.2-2 4.5-2s2.3 2 4.5 2 2.2-2 4.5-2 2.3 2 4.5 2" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" />
  </svg>`;
}

const AVATAR_COLORS = ["#0b7a83", "#d0532b", "#2e7d4f", "#3457d5", "#8a4cbf", "#b7791f", "#b8336a", "#5b6b7f"];

// A house shows as its number ("12B") when its name ends in one, else initials.
export function Avatar({ name, id = 0, size = 40 }) {
  const number = name.match(/(\d+\s?[a-zA-Z]?)$/);
  const label = number
    ? number[1].replace(/\s/g, "").toUpperCase()
    : name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  return html`<span class="avatar" aria-hidden="true"
    style=${{ "--c": AVATAR_COLORS[id % AVATAR_COLORS.length], width: `${size}px`, height: `${size}px`, fontSize: `${Math.round(size * (label.length > 2 ? 0.32 : 0.4))}px` }}>${label}</span>`;
}

export function Badge({ category }) {
  if (!category) return null;
  return html`<span class="badge" style=${{ "--c": category.color }}>${category.icon} ${category.label}</span>`;
}

// A row of filter buttons; exactly one is on.
export function Chips({ options, value, onChange, label }) {
  return html`<div class="chips" role="group" aria-label=${label}>
    ${options.map(
      (o) => html`<button type="button" key=${o.id} class=${`chip${o.id === value ? " on" : ""}`} aria-pressed=${o.id === value}
        style=${o.color ? { "--c": o.color } : null} onClick=${() => onChange(o.id)}>
        ${o.icon ? `${o.icon} ` : ""}${o.label}${o.count != null ? html` <span class="count">${o.count}</span>` : ""}
      </button>`,
    )}
  </div>`;
}

export function SearchBox({ value, onInput, placeholder = "Søk …" }) {
  return html`<label class="search">
    <${Icon} name="search" size=${18} />
    <input type="search" value=${value} placeholder=${placeholder} aria-label=${placeholder}
      onInput=${(e) => onInput(e.currentTarget.value)} />
  </label>`;
}

export function Field({ label, hint, children }) {
  return html`<label class="field">
    <span class="field-label">${label}</span>
    ${children}
    ${hint && html`<span class="hint">${hint}</span>`}
  </label>`;
}

export function PasswordInput({ value, onInput, autocomplete = "current-password", autofocus }) {
  const [show, setShow] = useState(false);
  return html`<div class="password">
    <input class="input" type=${show ? "text" : "password"} value=${value} required minlength="8"
      autocomplete=${autocomplete} autofocus=${autofocus} onInput=${(e) => onInput(e.currentTarget.value)} />
    <button type="button" class="btn ghost sm" onClick=${() => setShow(!show)}>${show ? "Skjul" : "Vis"}</button>
  </div>`;
}

// Form state as one object: const [form, setForm, bind] = useForm({...});
// then <input ...${bind("title")} />.
export function useForm(initial) {
  const [values, setValues] = useState(initial);
  const bind = (key) => ({
    value: values[key] ?? "",
    onInput: (e) => {
      const v = e.currentTarget.value;
      setValues((old) => ({ ...old, [key]: v }));
    },
  });
  return [values, setValues, bind];
}

// A native <dialog>, open while mounted. Esc, a close button and a click
// outside all close it, unless `mayClose()` says no (say, a half-written post).
function useDialog(onClose, mayClose) {
  const ref = useRef();
  const latest = useRef();
  latest.current = { onClose, mayClose };
  const close = () => (!latest.current.mayClose || latest.current.mayClose()) && ref.current.close();
  useEffect(() => {
    const dialog = ref.current;
    dialog.showModal();
    const closed = () => latest.current.onClose();
    const escape = (e) => latest.current.mayClose && !latest.current.mayClose() && e.preventDefault();
    dialog.addEventListener("close", closed);
    dialog.addEventListener("cancel", escape);
    return () => {
      dialog.removeEventListener("close", closed);
      dialog.removeEventListener("cancel", escape);
    };
  }, []);
  const outside = (e) => e.target === ref.current && close();
  return [ref, close, outside];
}

export function Modal({ title, onClose, mayClose, children }) {
  const [ref, close, outside] = useDialog(onClose, mayClose);
  return html`<dialog ref=${ref} class="modal" onClick=${outside}>
    <div class="modal-inner">
      <div class="modal-head">
        <h2>${title}</h2>
        <button type="button" class="icon-btn" aria-label="Lukk" onClick=${close}><${Icon} name="x" /></button>
      </div>
      <div class="modal-body">${children}</div>
    </div>
  </dialog>`;
}

// Pictures full screen: arrows, arrow keys or a swipe to move between them.
export function ImageViewer({ images, start = 0, onClose }) {
  const [ref, close, outside] = useDialog(onClose);
  const [index, setIndex] = useState(start);
  const count = images.length;
  const go = (step) => setIndex((i) => (i + step + count) % count);
  const swipe = useRef(0);
  const keys = (e) => {
    if (e.key === "ArrowLeft") go(-1);
    if (e.key === "ArrowRight") go(1);
  };
  return html`<dialog ref=${ref} class="viewer" onClick=${outside} onKeyDown=${keys}
      onTouchStart=${(e) => (swipe.current = e.touches[0].clientX)}
      onTouchEnd=${(e) => {
        const dx = e.changedTouches[0].clientX - swipe.current;
        if (count > 1 && Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
      }}>
    <img src=${`/api/images/${images[index].id}`} alt=${count > 1 ? `Bilde ${index + 1} av ${count}` : "Bilde"} />
    <button type="button" class="icon-btn viewer-close" aria-label="Lukk" onClick=${close}><${Icon} name="x" /></button>
    ${count > 1 && html`
      <button type="button" class="icon-btn viewer-prev" aria-label="Forrige bilde" onClick=${() => go(-1)}><${Icon} name="left" /></button>
      <button type="button" class="icon-btn viewer-next" aria-label="Neste bilde" onClick=${() => go(1)}><${Icon} name="right" /></button>
      <span class="viewer-count">${index + 1} / ${count}</span>`}
  </dialog>`;
}

export const Loading = () => html`<div class="loading" role="status"><span class="spinner"></span> Laster …</div>`;

export function Empty({ icon, title, children }) {
  return html`<div class="empty">
    <div class="empty-icon" aria-hidden="true">${icon}</div>
    <h3>${title}</h3>
    ${children && html`<p>${children}</p>`}
  </div>`;
}

// The value, once it has stopped changing for `ms` (so a search box does
// not ask the server on every keystroke).
export function useDebounced(value, ms = 300) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}
