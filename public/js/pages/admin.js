// The administrator's page: houses and their access, the portal's name,
// texts and colours, and the space pictures take. Moderation happens on the
// posts themselves.
import { html, useEffect, useState } from "../vendor/preact-htm.js";
import { Avatar, Field, Icon, Loading, Modal, api, byName, copyText, fullTime, showError, toast, useForm } from "../lib.js";

export function AdminPage({ cfg, reload }) {
  return html`<div class="stack-lg">
    <div class="page-head"><h1>Admin</h1></div>
    <${Houses} cfg=${cfg} reload=${reload} />
    <${Settings} cfg=${cfg} reload=${reload} />
    <${Storage} />
    <div class="card stack">
      <h2>Slik modererer du</h2>
      <p class="muted">
        Som administrator ser du «Rediger», «Slett» og «Fest» på alle innlegg, kommentarer og aktiviteter. Et festet
        innlegg ligger øverst på oppslagstavla til du løsner det. Lenkene endrer du på siden «Lenker».
      </p>
    </div>
  </div>`;
}

function status(h) {
  const invited = h.inviteExpires && h.inviteExpires > new Date().toISOString();
  if (h.active) return invited ? ["Aktiv · ny lenke sendt", "ok"] : ["Aktiv", "ok"];
  if (invited) return ["Invitert, venter", "wait"];
  return [h.inviteExpires ? "Invitasjonen gikk ut" : "Ikke invitert ennå", "off"];
}

function Houses({ cfg, reload }) {
  const [houses, setHouses] = useState(null);
  const [names, setNames] = useState("");
  const [inviting, setInviting] = useState(null);
  const [editing, setEditing] = useState(null);
  const load = () => api("/api/houses").then((r) => setHouses(r.houses.sort(byName)), showError);
  useEffect(() => {
    load();
  }, []);

  const add = async (e) => {
    e.preventDefault();
    try {
      const r = await api("/api/houses", { method: "POST", body: { names: names.split("\n") } });
      setNames("");
      toast(
        `${r.added.length} hus lagt til${r.skipped.length ? `. Fantes fra før: ${r.skipped.join(", ")}` : ""}`,
        r.added.length ? "ok" : "error",
      );
      load();
    } catch (err) {
      showError(err);
    }
  };
  const remove = async (h) => {
    if (!confirm(`Slette ${h.name}?\n\nAlle innlegg, kommentarer og aktiviteter fra huset slettes også. Dette kan ikke angres.`)) return;
    api(`/api/houses/${h.id}`, { method: "DELETE" }).then(() => {
      toast(`${h.name} er slettet`);
      load();
    }, showError);
  };

  return html`<section class="card stack">
    <div>
      <h2>Hus og tilgang</h2>
      <p class="muted small">
        Hvert hus får sin egen invitasjonslenke. Når de åpner den, velger de et passord som alle i huset bruker.
        Flytter noen, lager du en ny lenke til de nye beboerne: da blir de gamle logget ut.
      </p>
    </div>

    ${houses === null
      ? html`<${Loading} />`
      : html`<ul class="admin-houses">
          ${houses.map((h) => {
            const [label, kind] = status(h);
            return html`<li key=${h.id}>
              <${Avatar} name=${h.name} id=${h.id} size=${36} />
              <span class="admin-house-name">
                <strong>${h.name}</strong>
                <span class=${`status ${kind}`}>${label}${h.isAdmin ? " · administrator" : ""}</span>
              </span>
              <span class="row">
                <button class="btn sm" onClick=${() => setInviting(h)}><${Icon} name="share" size=${16} /> Invitasjon</button>
                <button class="icon-btn sm" aria-label=${`Endre ${h.name}`} onClick=${() => setEditing(h)}><${Icon} name="edit" size=${16} /></button>
                ${h.id === cfg.me.id
                  ? html`<span class="icon-btn sm" aria-hidden="true"></span>`
                  : html`<button class="icon-btn sm danger" aria-label=${`Slett ${h.name}`} onClick=${() => remove(h)}>
                      <${Icon} name="trash" size=${16} />
                    </button>`}
              </span>
            </li>`;
          })}
        </ul>`}

    <form class="stack" onSubmit=${add}>
      <${Field} label="Legg til hus" hint="Ett hus per linje, slik naboene kjenner det (for eksempel «Strandvågen 14»).">
        <textarea class="input" rows="3" value=${names} onInput=${(e) => setNames(e.currentTarget.value)}></textarea>
      <//>
      <div><button class="btn primary" disabled=${!names.trim()}><${Icon} name="plus" size=${18} /> Legg til</button></div>
    </form>

    ${inviting && html`<${InviteModal} cfg=${cfg} house=${inviting} onClose=${() => { setInviting(null); load(); }} />`}
    ${editing && html`<${HouseEditor} cfg=${cfg} house=${editing} onClose=${() => setEditing(null)}
      onSaved=${() => { setEditing(null); load(); if (editing.id === cfg.me.id) reload(); }} />`}
  </section>`;
}

function InviteModal({ cfg, house, onClose }) {
  const [invite, setInvite] = useState(null);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    await api(`/api/houses/${house.id}/invite`, { method: "POST", body: {} }).then(setInvite, showError);
    setBusy(false);
  };
  const message = invite &&
    `Hei! Her er invitasjonen til nabolagsportalen «${cfg.name}» for ${house.name}:\n${invite.url}\n\n` +
    `Åpne lenken og velg et passord som alle i huset kan bruke. Lenken virker til ${fullTime(invite.expires)}.`;

  return html`<${Modal} title=${`Invitasjon for ${house.name}`} onClose=${onClose}>
    ${!invite
      ? html`<div class="stack">
          <p>
            Lag en lenke og send den til huset, for eksempel på SMS eller e-post. Den virker i ${cfg.inviteDays} dager
            og kan brukes én gang.
          </p>
          ${house.active && html`<p class="notice">
            ${house.name} har allerede passord. Når den nye lenken brukes, velger de et nytt passord, og alle enheter
            som var logget inn som ${house.name} blir logget ut.
          </p>`}
          <p class="muted small">En ny lenke gjør en tidligere sendt lenke ugyldig.</p>
          <div class="row end">
            <button class="btn ghost" onClick=${onClose}>Avbryt</button>
            <button class="btn primary" disabled=${busy} onClick=${create}>Lag invitasjonslenke</button>
          </div>
        </div>`
      : html`<div class="stack">
          <${Field} label="Melding å sende">
            <textarea class="input" rows="8" readonly value=${message} onFocus=${(e) => e.currentTarget.select()}></textarea>
          <//>
          <div class="row wrap end">
            <button class="btn" onClick=${() => copyText(invite.url, "Lenken er kopiert")}><${Icon} name="link" size=${18} /> Kopier bare lenken</button>
            ${navigator.share && html`<button class="btn" onClick=${() => navigator.share({ text: message }).catch(() => {})}>
              <${Icon} name="share" size=${18} /> Del …
            </button>`}
            <button class="btn primary" onClick=${() => copyText(message, "Meldingen er kopiert")}><${Icon} name="copy" size=${18} /> Kopier meldingen</button>
          </div>
        </div>`}
  <//>`;
}

function HouseEditor({ cfg, house, onClose, onSaved }) {
  const [name, setName] = useState(house.name);
  const [isAdmin, setIsAdmin] = useState(house.isAdmin);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const save = async (e) => {
    e.preventDefault();
    if (house.id === cfg.me.id && !isAdmin && !confirm("Du fjerner din egen administratortilgang. Fortsette?")) return;
    setBusy(true);
    try {
      await api(`/api/houses/${house.id}`, { method: "PUT", body: { name, isAdmin } });
      toast("Lagret");
      onSaved();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return html`<${Modal} title=${`Endre ${house.name}`} onClose=${onClose}>
    <form class="stack" onSubmit=${save}>
      <${Field} label="Navn"><input class="input" required maxlength="60" value=${name} onInput=${(e) => setName(e.currentTarget.value)} /><//>
      <label class="check">
        <input type="checkbox" checked=${isAdmin} onChange=${(e) => setIsAdmin(e.currentTarget.checked)} />
        <span>
          <strong>Administrator</strong>
          <span class="hint block">Kan legge til hus, sende invitasjoner, endre tekster og lenker og slette alt innhold.
            Slik gir du portalen videre til en ny administrator.</span>
        </span>
      </label>
      ${error && html`<p class="form-error" role="alert">${error}</p>`}
      <div class="row end">
        <button type="button" class="btn ghost" onClick=${onClose}>Avbryt</button>
        <button class="btn primary" disabled=${busy}>Lagre</button>
      </div>
    </form>
  <//>`;
}

const sizeText = (bytes) =>
  bytes >= 1e9
    ? `${(bytes / 1e9).toLocaleString("nb-NO", { maximumFractionDigits: 1 })} GB`
    : `${(bytes / 1e6).toLocaleString("nb-NO", { maximumFractionDigits: bytes < 1e7 ? 1 : 0 })} MB`;

// How much of the free picture storage is used, so it is seen coming.
function Storage() {
  const [use, setUse] = useState(null);
  useEffect(() => {
    api("/api/storage").then(setUse, showError);
  }, []);
  if (!use) return null;
  const share = Math.min(100, (use.bytes / use.freeBytes) * 100);
  return html`<section class="card stack">
    <h2>Bilder</h2>
    <p>
      ${use.images} ${use.images === 1 ? "bilde" : "bilder"} bruker ${sizeText(use.bytes)} av
      ${sizeText(use.freeBytes)} gratis lagringsplass.
    </p>
    <div class="meter" aria-hidden="true"><span style=${{ width: `${Math.max(share, use.bytes ? 1 : 0)}%` }}></span></div>
    <p class="muted small">Et bilde slettes sammen med innlegget sitt.</p>
  </section>`;
}

function Settings({ cfg, reload }) {
  const [form, setForm, bind] = useForm({ name: cfg.name, tagline: cfg.tagline, welcome: cfg.welcome, theme: cfg.theme });
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/settings", { method: "PUT", body: form });
      await reload();
      toast("Innstillingene er lagret");
    } catch (err) {
      showError(err);
    }
    setBusy(false);
  };
  return html`<form class="card stack" onSubmit=${save}>
    <h2>Navn, tekster og farger</h2>
    <div class="grid-2">
      <${Field} label="Navnet på portalen"><input class="input" required maxlength="60" ...${bind("name")} /><//>
      <${Field} label="Undertittel"><input class="input" maxlength="120" ...${bind("tagline")} /><//>
    </div>
    <${Field} label="Velkomsttekst" hint="Vises øverst på oppslagstavla. La feltet stå tomt for å skjule den.">
      <textarea class="input" rows="3" maxlength="2000" ...${bind("welcome")}></textarea>
    <//>
    <fieldset class="field">
      <legend class="field-label">Fargetema</legend>
      <div class="swatches">
        ${cfg.themes.map((t) => html`<label key=${t.id} class="swatch">
          <input type="radio" name="theme" value=${t.id} checked=${form.theme === t.id}
            onChange=${() => setForm({ ...form, theme: t.id })} />
          <span class="swatch-dot" style=${{ background: t.accent }}></span> ${t.label}
        </label>`)}
      </div>
    </fieldset>
    <div class="row end"><button class="btn primary" disabled=${busy}>Lagre</button></div>
  </form>`;
}
