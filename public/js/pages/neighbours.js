// Who lives where: every house's own profile, searchable.
import { html, useEffect, useState } from "../vendor/preact-htm.js";
import { Avatar, Empty, Icon, Loading, SearchBox, api, byName, linkify, showError } from "../lib.js";

export function NeighboursPage({ cfg }) {
  const [houses, setHouses] = useState(null);
  const [query, setQuery] = useState("");
  useEffect(() => {
    api("/api/houses").then((r) => setHouses(r.houses.sort(byName)), showError);
  }, []);
  if (!houses) return html`<${Loading} />`;

  const q = query.trim().toLowerCase();
  const shown = houses.filter((h) => !q || [h.name, h.residents, h.about].join(" ").toLowerCase().includes(q));
  const active = houses.filter((h) => h.active).length;

  return html`<div>
    <div class="page-head">
      <h1>Naboer</h1>
      <span class="muted">${houses.length} hus, ${active} med innlogging</span>
      <span class="spacer"></span>
      <a class="btn" href="/mitt-hus"><${Icon} name="edit" size=${18} /> Rediger mitt hus</a>
    </div>
    <div class="filters">
      <${SearchBox} value=${query} onInput=${setQuery} placeholder="Søk etter navn eller adresse …" />
    </div>
    ${shown.length === 0
      ? html`<${Empty} icon="🔍" title="Ingen treff">Prøv et annet navn.<//>`
      : html`<div class="house-grid">${shown.map((h) => html`<${HouseCard} key=${h.id} house=${h} mine=${h.id === cfg.me.id} />`)}</div>`}
  </div>`;
}

function HouseCard({ house: h, mine }) {
  const empty = !h.residents && !h.phone && !h.email && !h.about;
  return html`<article class=${`card house${mine ? " mine" : ""}`}>
    <header class="house-head">
      <${Avatar} name=${h.name} id=${h.id} size=${48} />
      <div>
        <h3>${h.name}</h3>
        ${h.residents && html`<p>${h.residents}</p>`}
      </div>
      ${h.isAdmin && html`<span class="badge" title="Administrator for portalen"><${Icon} name="shield" size=${14} /> Admin</span>`}
    </header>
    ${h.about && html`<p class="prose small">${linkify(h.about)}</p>`}
    ${(h.phone || h.email) && html`<div class="contact">
      ${h.phone && html`<a class="btn sm" href=${`tel:${h.phone.replace(/[^\d+]/g, "")}`}><${Icon} name="phone" size=${16} /> ${h.phone}</a>`}
      ${h.email && html`<a class="btn sm" href=${`mailto:${h.email}`}><${Icon} name="mail" size=${16} /> ${h.email}</a>`}
    </div>`}
    ${empty && html`<p class="muted small">
      ${mine ? html`Dere har ikke fylt inn noe ennå. <a href="/mitt-hus">Fortell naboene hvem dere er</a>.`
        : h.active ? "Har ikke fylt inn noe ennå." : "Ikke med i portalen ennå."}
    </p>`}
  </article>`;
}
