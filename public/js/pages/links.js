// Useful links, grouped. The administrator adds and edits them here.
import { html, useEffect, useState } from "../vendor/preact-htm.js";
import { Chips, Empty, Field, Icon, Loading, Modal, SearchBox, api, showError, toast, useForm } from "../lib.js";

export function LinksPage({ cfg }) {
  const [links, setLinks] = useState(null);
  const [group, setGroup] = useState("");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(null); // a link, or {} for a new one
  useEffect(() => {
    api("/api/links").then((r) => setLinks(r.links), showError);
  }, []);
  if (!links) return html`<${Loading} />`;

  const groups = [...new Set(links.map((l) => l.group || "Annet"))];
  const q = query.trim().toLowerCase();
  const shown = links.filter(
    (l) =>
      (!group || (l.group || "Annet") === group) &&
      (!q || [l.title, l.description, l.url, l.group].join(" ").toLowerCase().includes(q)),
  );
  const admin = cfg.me.isAdmin;

  return html`<div>
    <div class="page-head">
      <h1>Nyttige lenker</h1>
      <span class="spacer"></span>
      ${admin && html`<button class="btn primary" onClick=${() => setEditing({ group })}><${Icon} name="plus" size=${18} /> Ny lenke</button>`}
    </div>
    <div class="filters">
      <${SearchBox} value=${query} onInput=${setQuery} placeholder="Søk i lenkene …" />
      ${groups.length > 1 && html`<${Chips} label="Gruppe" value=${group} onChange=${setGroup}
        options=${[{ id: "", label: "Alle" }, ...groups.map((g) => ({ id: g, label: g }))]} />`}
    </div>

    ${shown.length === 0
      ? html`<${Empty} icon="🔗" title=${links.length ? "Ingen treff" : "Ingen lenker ennå"}>
          ${links.length ? "Prøv et annet søk." : admin ? "Trykk «Ny lenke» for å legge til den første." : "Administratoren legger inn lenker her."}
        <//>`
      : groups
          .filter((g) => shown.some((l) => (l.group || "Annet") === g))
          .map((g) => html`<section key=${g} class="link-group">
            <h2 class="group-title">${g}</h2>
            <div class="link-grid">
              ${shown.filter((l) => (l.group || "Annet") === g).map((l) => html`<${LinkCard} key=${l.id} link=${l} admin=${admin} onEdit=${setEditing} />`)}
            </div>
          </section>`)}

    ${editing && html`<${LinkForm} link=${editing} groups=${groups} onClose=${() => setEditing(null)}
      onSaved=${(all) => { setLinks(all); setEditing(null); }} />`}
  </div>`;
}

function LinkCard({ link: l, admin, onEdit }) {
  const kind = l.url.startsWith("tel:") ? "phone" : l.url.startsWith("mailto:") ? "mail" : "link";
  const web = kind === "link";
  const shown =
    kind === "phone" ? l.url.slice(4) : kind === "mail" ? l.url.slice(7) : new URL(l.url).hostname.replace(/^www\./, "");
  return html`<div class="card link-card">
    <a href=${l.url} target=${web ? "_blank" : null} rel=${web ? "noopener noreferrer" : null}>
      <span class="link-icon"><${Icon} name=${kind} /></span>
      <span class="link-text">
        <strong>${l.title}</strong>
        ${l.description && html`<span class="small">${l.description}</span>`}
        <span class="muted small">${shown}</span>
      </span>
    </a>
    ${admin && html`<button type="button" class="icon-btn sm" aria-label=${`Rediger ${l.title}`} onClick=${() => onEdit(l)}>
      <${Icon} name="edit" size=${16} />
    </button>`}
  </div>`;
}

function LinkForm({ link, groups, onClose, onSaved }) {
  const isNew = !link.id;
  const [form, , bind] = useForm({ group: "", title: "", url: "", description: "", ...link });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = async (method, path, body) => {
    setBusy(true);
    setError("");
    try {
      const r = await api(path, { method, body });
      onSaved(r.links);
      toast(method === "DELETE" ? "Lenken er slettet" : "Lenken er lagret");
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  const save = (e) => {
    e.preventDefault();
    run(isNew ? "POST" : "PUT", isNew ? "/api/links" : `/api/links/${link.id}`, form);
  };
  const remove = () => confirm(`Slette «${link.title}»?`) && run("DELETE", `/api/links/${link.id}`);

  return html`<${Modal} title=${isNew ? "Ny lenke" : "Rediger lenke"} onClose=${onClose}>
    <form class="stack" onSubmit=${save}>
      <${Field} label="Tittel"><input class="input" required maxlength="80" placeholder="For eksempel «Søppeltømming»" ...${bind("title")} /><//>
      <${Field} label="Adresse" hint="En nettside (yr.no), et telefonnummer eller en e-postadresse.">
        <input class="input" required maxlength="500" inputmode="url" ...${bind("url")} />
      <//>
      <${Field} label="Beskrivelse (valgfritt)"><input class="input" maxlength="200" ...${bind("description")} /><//>
      <${Field} label="Gruppe" hint="Lenker med samme gruppe vises sammen.">
        <input class="input" maxlength="60" list="link-groups" placeholder="For eksempel «Kommune»" ...${bind("group")} />
        <datalist id="link-groups">${groups.map((g) => html`<option key=${g} value=${g} />`)}</datalist>
      <//>
      ${error && html`<p class="form-error" role="alert">${error}</p>`}
      <div class="row end">
        ${!isNew && html`<button type="button" class="btn ghost danger" onClick=${remove}><${Icon} name="trash" size=${18} /> Slett</button>`}
        <span class="spacer"></span>
        <button type="button" class="btn ghost" onClick=${onClose}>Avbryt</button>
        <button class="btn primary" disabled=${busy}>Lagre</button>
      </div>
    </form>
  <//>`;
}
