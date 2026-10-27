// What is new since this device last looked: the counts on the menu and the
// "Ny" marks on posts, comments and activities. Kept per device, not per
// house: everyone in a house shares one login, but each has their own phone.
// The times are the server's, so a phone with a wrong clock still agrees.
import { useEffect, useState } from "./vendor/preact-htm.js";
import { api, recall, remember } from "./lib.js";

const KEYS = { wall: "nabolag:sett:oppslag", calendar: "nabolag:sett:kalender" };

let counts = { wall: 0, calendar: 0 };
const listeners = new Set();
const publish = (next) => {
  counts = next;
  listeners.forEach((fn) => fn(counts));
};

// When this device last looked at the board ("wall") or the calendar;
// "" before the first time.
export const seenSince = (section) => recall(KEYS[section]);

export function markSeen(section, serverNow) {
  remember(KEYS[section], serverNow);
  publish({ ...counts, [section]: 0 });
}

export async function refreshNews() {
  const asked = { wall: seenSince("wall"), calendar: seenSince("calendar") };
  try {
    const r = await api(`/api/news?${new URLSearchParams(asked)}`);
    const next = { ...counts };
    for (const section of Object.keys(KEYS)) {
      if (!asked[section]) remember(KEYS[section], r.now); // a new device starts with nothing new
      // Looked at meanwhile (the answer is about the old time): keep it cleared.
      next[section] = asked[section] && seenSince(section) === asked[section] ? r[section] : 0;
    }
    publish(next);
  } catch {}
}

export function useNews() {
  const [state, setState] = useState(counts);
  useEffect(() => {
    listeners.add(setState);
    return () => listeners.delete(setState);
  }, []);
  return state;
}
