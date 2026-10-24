// The common calendar: a list of what is coming, or a month grid.
import { html, useEffect, useMemo, useState } from "../vendor/preact-htm.js";
import {
  Avatar, Badge, Chips, Empty, Field, Icon, Loading, Modal,
  addDays, api, byId, dayISO, eventLastDay, eventWhen, formatDay, linkify, monthName, parseDay,
  recall, remember, showError, toast, todayISO, useForm,
} from "../lib.js";

const VIEW_KEY = "nabolag:kalendervisning";

export function CalendarPage({ cfg }) {
  const today = todayISO();
  const [events, setEvents] = useState(null);
  const [view, setView] = useState(recall(VIEW_KEY, "liste"));
  const [category, setCategory] = useState("");
  const [showPast, setShowPast] = useState(false);
  const [month, setMonth] = useState({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 });
  const [day, setDay] = useState(today);
  const [openId, setOpenId] = useState(Number(new URLSearchParams(location.search).get("aktivitet")) || null);
  const [editing, setEditing] = useState(null); // an event, or {} for a new one

  useEffect(() => {
    api("/api/events").then((r) => setEvents(r.events), showError);
  }, []);

  const shown = useMemo(
    () => (events || []).filter((e) => !category || e.category === category),
    [events, category],
  );
  const changeView = (v) => {
    setView(v);
    remember(VIEW_KEY, v);
  };
  const saved = (e) => {
    setEvents((es) => [...es.filter((x) => x.id !== e.id), e].sort(byStart));
    setEditing(null);
    setOpenId(e.id);
  };
  const removed = (id) => {
    setEvents((es) => es.filter((x) => x.id !== id));
    setOpenId(null);
  };
  const updated = (e) => setEvents((es) => es.map((x) => (x.id === e.id ? e : x)));
  const open = events && openId ? byId(events, openId) : null;

  return html`<div class="calendar">
    <div class="page-head">
      <h1>Kalender</h1>
      <div class="segmented" role="group" aria-label="Visning">
        <button type="button" aria-pressed=${view === "liste"} onClick=${() => changeView("liste")}>
          <${Icon} name="list" size=${18} /> Liste
        </button>
        <button type="button" aria-pressed=${view === "maned"} onClick=${() => changeView("maned")}>
          <${Icon} name="grid" size=${18} /> Måned
        </button>
      </div>
      <button class="btn primary" onClick=${() => setEditing({ startDate: view === "maned" ? day : today })}>
        <${Icon} name="plus" size=${18} /> Ny aktivitet
      </button>
    </div>

    <div class="filters">
      <${Chips} label="Kategori" value=${category} onChange=${setCategory}
        options=${[{ id: "", label: "Alle" }, ...cfg.eventCategories]} />
    </div>

    ${events === null
      ? html`<${Loading} />`
      : view === "liste"
        ? html`<${EventList} cfg=${cfg} events=${shown} today=${today} showPast=${showPast}
            onShowPast=${() => setShowPast(!showPast)} onOpen=${setOpenId} onChange=${updated} />`
        : html`<${MonthGrid} cfg=${cfg} events=${shown} month=${month} setMonth=${setMonth}
            day=${day} setDay=${setDay} today=${today} onOpen=${setOpenId}
            onNew=${(d) => setEditing({ startDate: d })} onChange=${updated} />`}

    ${open && html`<${EventDetail} cfg=${cfg} event=${open} onClose=${() => setOpenId(null)}
      onEdit=${() => { setEditing(open); setOpenId(null); }} onChange=${updated} onDelete=${removed} />`}
    ${editing && html`<${EventForm} cfg=${cfg} event=${editing} onClose=${() => setEditing(null)} onSaved=${saved} />`}
  </div>`;
}

const byStart = (a, b) =>
  a.startDate.localeCompare(b.startDate) || a.startTime.localeCompare(b.startTime) || a.id - b.id;

// "kl. 10:00–14:00", "Hele dagen", "til mandag 4. mai"
function timeLabel(e) {
  if (e.endDate) return `til ${formatDay(e.endDate).toLowerCase()}`;
  if (!e.startTime) return "Hele dagen";
  return `kl. ${e.startTime}${e.endTime ? `–${e.endTime}` : ""}`;
}

function EventList({ cfg, events, today, showPast, onShowPast, onOpen, onChange }) {
  const upcoming = events.filter((e) => eventLastDay(e) >= today);
  const past = events.filter((e) => eventLastDay(e) < today).reverse();

  const months = [];
  for (const e of upcoming) {
    const key = e.startDate.slice(0, 7);
    if (months.at(-1)?.key !== key) months.push({ key, events: [] });
    months.at(-1).events.push(e);
  }

  return html`
    ${upcoming.length === 0
      ? html`<${Empty} icon="📅" title="Ingenting planlagt ennå">
          Planlegger du dugnad, grillkveld eller møte? Trykk «Ny aktivitet».
        <//>`
      : months.map(
          (m) => html`<section key=${m.key} class="month-group">
            <h2 class="group-title">${monthName(Number(m.key.slice(0, 4)), Number(m.key.slice(5)) - 1)}</h2>
            ${m.events.map((e) => html`<${EventRow} key=${e.id} cfg=${cfg} event=${e} onOpen=${onOpen} onChange=${onChange} />`)}
          </section>`,
        )}
    ${past.length > 0 && html`
      <button type="button" class="btn ghost block" onClick=${onShowPast}>
        ${showPast ? "Skjul tidligere aktiviteter" : `Vis tidligere aktiviteter (${past.length})`}
      </button>
      ${showPast && html`<section class="month-group past">
        <h2 class="group-title">Tidligere</h2>
        ${past.map((e) => html`<${EventRow} key=${e.id} cfg=${cfg} event=${e} onOpen=${onOpen} onChange=${onChange} past />`)}
      </section>`}`}
  `;
}

function EventRow({ cfg, event: e, onOpen, onChange, past }) {
  const cat = byId(cfg.eventCategories, e.category);
  return html`<article class=${`card event-row${past ? " past" : ""}`}>
    <button type="button" class="event-open" onClick=${() => onOpen(e.id)}>
      <span class="date-block" style=${{ "--c": cat?.color }}>
        <span>${formatDay(e.startDate, { weekday: "short" }).replace(".", "")}</span>
        <strong>${Number(e.startDate.slice(8))}</strong>
        <span>${formatDay(e.startDate, { month: "short" }).replace(".", "").toLowerCase()}</span>
      </span>
      <span class="event-info">
        <span class="event-title">${e.title}</span>
        <span class="meta">
          <span><${Icon} name="clock" size=${15} /> ${timeLabel(e)}</span>
          ${e.location && html`<span><${Icon} name="place" size=${15} /> ${e.location}</span>`}
        </span>
        <span class="meta">
          <${Badge} category=${cat} />
          ${e.going.length > 0 && html`<span>${e.going.length} hus kommer</span>`}
        </span>
      </span>
    </button>
    ${!past && html`<${RsvpButton} cfg=${cfg} event=${e} onChange=${onChange} compact />`}
  </article>`;
}

function RsvpButton({ cfg, event, onChange, compact }) {
  const going = event.going.some((g) => g.id === cfg.me.id);
  const toggle = () =>
    api(`/api/events/${event.id}/rsvp`, { method: "PUT", body: { going: !going } }).then((e) => {
      onChange(e);
      toast(going ? "Dere er meldt av" : "Flott, dere er påmeldt!");
    }, showError);
  return html`<button type="button" class=${`btn ${going ? "going" : ""} ${compact ? "sm" : ""}`} aria-pressed=${going}
    onClick=${toggle} title=${going ? "Trykk for å melde av" : "Si fra at dere kommer"}>
    ${going ? html`<${Icon} name="check" size=${16} /> Vi kommer` : "Vi kommer"}
  </button>`;
}

function MonthGrid({ cfg, events, month, setMonth, day, setDay, today, onOpen, onNew, onChange }) {
  const first = new Date(Date.UTC(month.y, month.m, 1));
  const lead = (first.getUTCDay() + 6) % 7; // Monday first
  const daysInMonth = new Date(Date.UTC(month.y, month.m + 1, 0)).getUTCDate();
  const start = addDays(dayISO(first), -lead);
  const weeks = Array.from({ length: Math.ceil((lead + daysInMonth) / 7) }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)),
  );
  const on = (d) => events.filter((e) => e.startDate <= d && d <= eventLastDay(e));
  const step = (n) => setMonth(({ y, m }) => ({ y: y + Math.floor((m + n) / 12), m: (((m + n) % 12) + 12) % 12 }));
  const goToday = () => {
    setMonth({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 });
    setDay(today);
  };
  const dayEvents = on(day);
  const monthKey = `${month.y}-${String(month.m + 1).padStart(2, "0")}`;

  return html`<div class="card month">
      <div class="month-head">
        <button type="button" class="icon-btn" aria-label="Forrige måned" onClick=${() => step(-1)}><${Icon} name="left" /></button>
        <h2>${monthName(month.y, month.m)}</h2>
        <button type="button" class="icon-btn" aria-label="Neste måned" onClick=${() => step(1)}><${Icon} name="right" /></button>
        <span class="spacer"></span>
        <button type="button" class="btn sm" onClick=${goToday}>I dag</button>
      </div>
      <div class="month-grid">
        <div class="wk head">Uke</div>
        ${["man", "tir", "ons", "tor", "fre", "lør", "søn"].map((d) => html`<div class="dow" key=${d}>${d}</div>`)}
        ${weeks.map((week) => html`
          <div class="wk" key=${week[0]}>${isoWeek(week[0])}</div>
          ${week.map((d) => {
            const list = on(d);
            const cls = ["cell", d.slice(0, 7) !== monthKey && "other", d === today && "today", d === day && "selected"];
            return html`<div class=${cls.filter(Boolean).join(" ")} key=${d} onClick=${() => setDay(d)}>
              <span class="num">${Number(d.slice(8))}</span>
              <span class="pills">
                ${list.slice(0, 3).map((e) => {
                  const cat = byId(cfg.eventCategories, e.category);
                  return html`<button type="button" key=${e.id} class="pill" style=${{ "--c": cat?.color }} title=${e.title}
                    onClick=${(ev) => { ev.stopPropagation(); setDay(d); onOpen(e.id); }}>
                    ${e.startDate === d && e.startTime ? `${e.startTime} ` : ""}${e.title}
                  </button>`;
                })}
                ${list.length > 3 && html`<span class="more">+${list.length - 3}</span>`}
              </span>
            </div>`;
          })}`)}
      </div>
    </div>

    <section class="day-list">
      <div class="card-title">
        <h2>${formatDay(day)}</h2>
        <button type="button" class="btn sm" onClick=${() => onNew(day)}><${Icon} name="plus" size=${16} /> Ny denne dagen</button>
      </div>
      ${dayEvents.length === 0
        ? html`<p class="muted">Ingen aktiviteter denne dagen.</p>`
        : dayEvents.map((e) => html`<${EventRow} key=${e.id} cfg=${cfg} event=${e} onOpen=${onOpen} onChange=${onChange}
            past=${eventLastDay(e) < today} />`)}
    </section>`;
}

// ISO week number (Norwegian "uke").
function isoWeek(s) {
  const d = parseDay(s);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7)); // that week's Thursday
  return Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86_400_000 + 1) / 7);
}

function EventDetail({ cfg, event: e, onClose, onEdit, onChange, onDelete }) {
  const cat = byId(cfg.eventCategories, e.category);
  const canEdit = e.houseId === cfg.me.id || cfg.me.isAdmin;
  const past = eventLastDay(e) < todayISO();
  const remove = async () => {
    if (!confirm(`Slette «${e.title}»?`)) return;
    try {
      await api(`/api/events/${e.id}`, { method: "DELETE" });
      onDelete(e.id);
      toast("Aktiviteten er slettet");
    } catch (err) {
      showError(err);
    }
  };

  return html`<${Modal} title=${e.title} onClose=${onClose}>
    <div class="stack">
      <div><${Badge} category=${cat} /></div>
      <p class="detail-line"><${Icon} name="clock" /> ${eventWhen(e)}</p>
      ${e.location && html`<p class="detail-line"><${Icon} name="place" /> ${e.location}</p>`}
      ${e.description && html`<p class="prose">${linkify(e.description)}</p>`}
      <p class="muted small">Lagt inn av ${e.houseName}</p>

      <div class="rsvp-box">
        <strong>${e.going.length ? `Påmeldt (${e.going.length} hus)` : "Ingen påmeldt ennå"}</strong>
        <div class="going-list">
          ${e.going.map((g) => html`<span class="going-chip" key=${g.id}><${Avatar} name=${g.name} id=${g.id} size=${22} /> ${g.name}</span>`)}
        </div>
      </div>

      <div class="row wrap">
        ${!past && html`<${RsvpButton} cfg=${cfg} event=${e} onChange=${onChange} />`}
        <button type="button" class="btn" onClick=${() => downloadIcs(e)}>
          <${Icon} name="download" size=${18} /> Legg til i min kalender
        </button>
      </div>
      ${canEdit && html`<div class="row end">
        <button type="button" class="btn ghost danger" onClick=${remove}><${Icon} name="trash" size=${18} /> Slett</button>
        <button type="button" class="btn" onClick=${onEdit}><${Icon} name="edit" size=${18} /> Rediger</button>
      </div>`}
    </div>
  <//>`;
}

function EventForm({ cfg, event, onClose, onSaved }) {
  const isNew = !event.id;
  const [form, setForm, bind] = useForm({
    title: "",
    category: cfg.eventCategories[0].id,
    startTime: "",
    endTime: "",
    endDate: "",
    location: "",
    description: "",
    ...event,
  });
  const [allDay, setAllDay] = useState(!isNew && !event.startTime);
  const [multiDay, setMultiDay] = useState(!!event.endDate);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async (e) => {
    e.preventDefault();
    setError("");
    if (!allDay && !form.startTime) return setError("Skriv når aktiviteten starter, eller kryss av for «Hele dagen».");
    setBusy(true);
    const body = {
      ...form,
      startTime: allDay ? "" : form.startTime,
      endTime: allDay ? "" : form.endTime,
      endDate: multiDay ? form.endDate : "",
    };
    try {
      const saved = await api(isNew ? "/api/events" : `/api/events/${event.id}`, { method: isNew ? "POST" : "PUT", body });
      toast(isNew ? "Aktiviteten er lagt i kalenderen" : "Endringene er lagret");
      onSaved(saved);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return html`<${Modal} title=${isNew ? "Ny aktivitet" : "Rediger aktivitet"} onClose=${onClose}>
    <form class="stack" onSubmit=${save}>
      <${Field} label="Hva skal skje?">
        <input class="input" required maxlength="120" placeholder="For eksempel «Vårdugnad»" ...${bind("title")} />
      <//>
      <div class="field">
        <span class="field-label">Kategori</span>
        <${Chips} label="Kategori" value=${form.category} onChange=${(c) => setForm({ ...form, category: c })}
          options=${cfg.eventCategories} />
      </div>
      <div class="grid-2">
        <${Field} label=${multiDay ? "Fra dato" : "Dato"}>
          <input class="input" type="date" required ...${bind("startDate")} />
        <//>
        ${multiDay && html`<${Field} label="Til dato">
          <input class="input" type="date" required min=${form.startDate} ...${bind("endDate")} />
        <//>`}
      </div>
      <div class="row wrap">
        <label class="check"><input type="checkbox" checked=${allDay} onChange=${(e) => setAllDay(e.currentTarget.checked)} /> Hele dagen</label>
        <label class="check"><input type="checkbox" checked=${multiDay}
          onChange=${(e) => { setMultiDay(e.currentTarget.checked); if (!form.endDate) setForm({ ...form, endDate: addDays(form.startDate, 1) }); }} />
          Varer flere dager</label>
      </div>
      ${!allDay && html`<div class="grid-2">
        <${Field} label="Starter kl."><input class="input" type="time" ...${bind("startTime")} /><//>
        <${Field} label="Slutter kl. (valgfritt)"><input class="input" type="time" ...${bind("endTime")} /><//>
      </div>`}
      <${Field} label="Sted (valgfritt)">
        <input class="input" maxlength="120" placeholder="For eksempel «Lekeplassen»" ...${bind("location")} />
      <//>
      <${Field} label="Beskrivelse (valgfritt)" hint="Hva skal dere gjøre, hva bør folk ta med?">
        <textarea class="input" rows="4" maxlength="4000" ...${bind("description")}></textarea>
      <//>
      ${error && html`<p class="form-error" role="alert">${error}</p>`}
      <div class="row end">
        <button type="button" class="btn ghost" onClick=${onClose}>Avbryt</button>
        <button class="btn primary" disabled=${busy}>${isNew ? "Legg i kalenderen" : "Lagre"}</button>
      </div>
    </form>
  <//>`;
}

// ------------------------------------------------- "Legg til i min kalender"

function downloadIcs(e) {
  const blob = new Blob([icsFor(e)], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${e.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").toLowerCase() || "aktivitet"}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function icsFor(e) {
  const escape = (s) => s.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);
  const stamp = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lastDay = eventLastDay(e);
  let when;
  if (e.startTime) {
    const start = norwayToUtc(e.startDate, e.startTime);
    const end = e.endTime
      ? norwayToUtc(lastDay, e.endTime)
      : e.endDate
        ? norwayToUtc(addDays(lastDay, 1), "00:00")
        : new Date(start.getTime() + 2 * 3_600_000);
    when = [`DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`];
  } else {
    when = [`DTSTART;VALUE=DATE:${e.startDate.replace(/-/g, "")}`, `DTEND;VALUE=DATE:${addDays(lastDay, 1).replace(/-/g, "")}`];
  }
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Nabolagsportal//NO", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:aktivitet-${e.id}@${location.host}`,
    `DTSTAMP:${stamp(new Date())}`,
    ...when,
    `SUMMARY:${escape(e.title)}`,
    e.location && `LOCATION:${escape(e.location)}`,
    e.description && `DESCRIPTION:${escape(e.description)}`,
    `URL:${location.origin}/kalender?aktivitet=${e.id}`,
    "END:VEVENT", "END:VCALENDAR",
  ].filter(Boolean);
  // Calendar files want lines of at most 75 characters, continued with a space.
  return lines.map((l) => l.match(/.{1,72}/gu).join("\r\n ")).join("\r\n") + "\r\n";
}

// The UTC moment of a Norwegian wall-clock date and time (summer time aware).
function norwayToUtc(date, time) {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  const offset = (t) => {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/Oslo", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit",
      }).formatToParts(new Date(t)).map((x) => [x.type, x.value]),
    );
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute) - t;
  };
  const first = wall - offset(wall);
  return new Date(wall - offset(first));
}
