// The front page: a greeting, the wall of posts, and the next activities.
import { html, useEffect, useState } from "../vendor/preact-htm.js";
import {
  Avatar, Badge, Chips, Empty, Icon, Loading, SearchBox,
  api, byId, eventLastDay, eventWhen, formatDay, fullTime, hourInNorway, linkify, recall, remember,
  showError, timeAgo, toast, todayISO, useDebounced,
} from "../lib.js";
import { AppTip } from "../install.js";

// The optional "who in the house wrote this", remembered per device.
const NAME_KEY = "nabolag:navn";

export function WallPage({ cfg }) {
  const [category, setCategory] = useState("");
  const [house, setHouse] = useState(null);
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim());
  const [posts, setPosts] = useState(null);
  const [more, setMore] = useState(false);

  const load = (offset = 0) => {
    const params = new URLSearchParams({ offset });
    if (category) params.set("category", category);
    if (house) params.set("house", house.id);
    if (q) params.set("q", q);
    return api(`/api/posts?${params}`).then((r) => {
      setPosts((old) => (offset ? [...old, ...r.posts] : r.posts));
      setMore(r.more);
    }, showError);
  };
  useEffect(() => {
    setPosts(null);
    load();
  }, [category, house, q]);

  const replace = (post) => setPosts((ps) => ps.map((p) => (p.id === post.id ? post : p)));
  const remove = (id) => setPosts((ps) => ps.filter((p) => p.id !== id));
  const filtered = category || house || q;

  return html`<div class="wall">
    <${Hero} cfg=${cfg} />
    <aside class="wall-side">
      <${AppTip} />
      <${NextEvents} cfg=${cfg} />
    </aside>

    <section class="wall-main">
      <${Composer} cfg=${cfg} onPosted=${(p) => {
        if (filtered) {
          setCategory("");
          setHouse(null);
          setQuery("");
        } else setPosts((ps) => [...ps.filter((x) => x.pinned), p, ...ps.filter((x) => !x.pinned)]);
      }} />

      <div class="filters">
        <${SearchBox} value=${query} onInput=${setQuery} placeholder="Søk i innleggene …" />
        <${Chips} label="Kategori" value=${category} onChange=${setCategory}
          options=${[{ id: "", label: "Alle" }, ...cfg.postCategories]} />
        ${house && html`<div class="chips">
          <button class="chip on" onClick=${() => setHouse(null)}>Bare ${house.name} <${Icon} name="x" size=${14} /></button>
        </div>`}
      </div>

      ${posts === null
        ? html`<${Loading} />`
        : posts.length === 0
          ? filtered
            ? html`<${Empty} icon="🔍" title="Ingen innlegg passer">Prøv et annet søk eller en annen kategori.<//>`
            : html`<${Empty} icon="👋" title="Ingen innlegg ennå">Bli den første som skriver noe til naboene!<//>`
          : posts.map(
              (p) => html`<${PostCard} key=${p.id} post=${p} cfg=${cfg}
                onChange=${replace} onDelete=${remove} onHouse=${(h) => setHouse(h)} />`,
            )}
      ${more && html`<button class="btn block" onClick=${() => load(posts.length)}>Vis flere innlegg</button>`}
    </section>
  </div>`;
}

// The coloured band at the top: a greeting by time of day, and the
// administrator's welcome text.
function Hero({ cfg }) {
  const hour = hourInNorway();
  const hello = hour >= 5 && hour < 10 ? "God morgen" : hour >= 17 ? "God kveld" : "Hei";
  const name = recall(NAME_KEY).split(/\s+/)[0] || cfg.me.name;
  return html`<header class="hero">
    <h1>${hello}, ${name}!</h1>
    ${cfg.welcome && html`<p>${linkify(cfg.welcome)}</p>`}
  </header>`;
}

function Composer({ cfg, onPosted }) {
  const [body, setBody] = useState("");
  const [category, setCategory] = useState(cfg.postCategories[0].id);
  const [author, setAuthor] = useState(recall(NAME_KEY));
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const post = await api("/api/posts", { method: "POST", body: { body, category, author } });
      remember(NAME_KEY, author.trim());
      onPosted(post);
      setBody("");
      setOpen(false);
      toast("Innlegget er publisert");
    } catch (err) {
      showError(err);
    }
    setBusy(false);
  };

  return html`<form class=${`card composer${open ? " open" : ""}`} onSubmit=${submit}>
    <div class="composer-top">
      <${Avatar} name=${cfg.me.name} id=${cfg.me.id} />
      <textarea class="input" rows=${open ? 4 : 1} maxlength="5000" value=${body}
        placeholder="Hva vil du dele med naboene?" aria-label="Nytt innlegg"
        onFocus=${() => setOpen(true)} onInput=${(e) => setBody(e.currentTarget.value)}></textarea>
    </div>
    ${open && html`
      <div class="composer-row">
        <span class="field-label">Kategori</span>
        <${Chips} label="Kategori" value=${category} onChange=${setCategory} options=${cfg.postCategories} />
      </div>
      <div class="composer-foot">
        <input class="input" maxlength="60" value=${author} placeholder="Ditt navn (valgfritt)"
          aria-label="Ditt navn" onInput=${(e) => setAuthor(e.currentTarget.value)} />
        <span class="spacer"></span>
        <button type="button" class="btn ghost" onClick=${() => { setOpen(false); setBody(""); }}>Avbryt</button>
        <button class="btn primary" disabled=${busy || !body.trim()}>Publiser</button>
      </div>`}
  </form>`;
}

// Long posts fold after this many characters or lines.
const FOLD_CHARS = 600;
const FOLD_LINES = 10;

function PostCard({ post, cfg, onChange, onDelete, onHouse }) {
  const me = cfg.me;
  const mine = post.houseId === me.id;
  const canEdit = mine || me.isAdmin;
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [unfolded, setUnfolded] = useState(false);
  const long = post.body.length > FOLD_CHARS || post.body.split("\n").length > FOLD_LINES;

  const remove = async () => {
    if (!confirm("Slette innlegget? Kommentarene forsvinner også.")) return;
    try {
      await api(`/api/posts/${post.id}`, { method: "DELETE" });
      onDelete(post.id);
      toast("Innlegget er slettet");
    } catch (err) {
      showError(err);
    }
  };
  const pin = () =>
    api(`/api/posts/${post.id}/pin`, { method: "PUT", body: { pinned: !post.pinned } }).then((p) => {
      onChange(p);
      toast(p.pinned ? "Festet øverst på tavla" : "Ikke lenger festet");
    }, showError);

  return html`<article class=${`card post${post.pinned ? " pinned" : ""}`}>
    <header class="post-head">
      <${Avatar} name=${post.houseName} id=${post.houseId} />
      <div class="who">
        <button type="button" class="link-btn strong" title="Vis bare innlegg fra dette huset"
          onClick=${() => onHouse({ id: post.houseId, name: post.houseName })}>${post.houseName}</button>
        ${post.author && html`<span class="muted"> · ${post.author}</span>`}
        <div class="meta" title=${fullTime(post.createdAt)}>
          ${timeAgo(post.createdAt)}${post.editedAt && " · redigert"}
        </div>
      </div>
      <div class="post-tags">
        ${post.pinned && html`<span class="badge pin"><${Icon} name="pin" size=${14} /> Festet</span>`}
        <${Badge} category=${byId(cfg.postCategories, post.category)} />
      </div>
    </header>

    ${editing
      ? html`<${PostEditor} cfg=${cfg} post=${post} onDone=${(p) => { if (p) onChange(p); setEditing(false); }} />`
      : html`<div class=${`post-body${long && !unfolded ? " folded" : ""}`}>${linkify(post.body)}</div>
          ${long && html`<button type="button" class="link-btn" onClick=${() => setUnfolded(!unfolded)}>
            ${unfolded ? "Vis mindre" : "Les mer"}
          </button>`}`}

    <footer class="post-actions">
      <button type="button" class="btn ghost sm" onClick=${() => setReplying(true)}>
        <${Icon} name="chat" size=${16} /> Kommenter${post.comments.length ? ` (${post.comments.length})` : ""}
      </button>
      <span class="spacer"></span>
      ${me.isAdmin && html`<button type="button" class="btn ghost sm" onClick=${pin} aria-label=${post.pinned ? "Løsne" : "Fest øverst"}>
        <${Icon} name="pin" size=${16} /><span class="label">${post.pinned ? "Løsne" : "Fest"}</span>
      </button>`}
      ${canEdit && !editing && html`<button type="button" class="btn ghost sm" onClick=${() => setEditing(true)} aria-label="Rediger">
        <${Icon} name="edit" size=${16} /><span class="label">Rediger</span>
      </button>`}
      ${canEdit && html`<button type="button" class="btn ghost sm danger" onClick=${remove} aria-label="Slett">
        <${Icon} name="trash" size=${16} /><span class="label">Slett</span>
      </button>`}
    </footer>

    ${(post.comments.length > 0 || replying) &&
    html`<${Comments} post=${post} cfg=${cfg} onChange=${onChange} focus=${replying} />`}
  </article>`;
}

function PostEditor({ cfg, post, onDone }) {
  const [body, setBody] = useState(post.body);
  const [category, setCategory] = useState(post.category);
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      onDone(await api(`/api/posts/${post.id}`, { method: "PUT", body: { body, category, author: post.author } }));
      toast("Endringene er lagret");
    } catch (err) {
      showError(err);
      setBusy(false);
    }
  };
  return html`<form class="stack" onSubmit=${save}>
    <textarea class="input" rows="5" maxlength="5000" value=${body} aria-label="Innlegget"
      onInput=${(e) => setBody(e.currentTarget.value)}></textarea>
    <${Chips} label="Kategori" value=${category} onChange=${setCategory} options=${cfg.postCategories} />
    <div class="row end">
      <button type="button" class="btn ghost" onClick=${() => onDone(null)}>Avbryt</button>
      <button class="btn primary" disabled=${busy || !body.trim()}>Lagre</button>
    </div>
  </form>`;
}

// Long threads show the last few comments until opened.
const COMMENTS_SHOWN = 3;

function Comments({ post, cfg, onChange, focus }) {
  const [text, setText] = useState("");
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const hidden = all ? 0 : Math.max(0, post.comments.length - COMMENTS_SHOWN);

  const send = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      onChange(await api(`/api/posts/${post.id}/comments`, {
        method: "POST",
        body: { body: text, author: recall(NAME_KEY) },
      }));
      setText("");
    } catch (err) {
      showError(err);
    }
    setBusy(false);
  };
  const remove = async (c) => {
    if (!confirm("Slette kommentaren?")) return;
    api(`/api/comments/${c.id}`, { method: "DELETE" }).then(onChange, showError);
  };

  return html`<div class="comments">
    ${hidden > 0 && html`<button type="button" class="link-btn" onClick=${() => setAll(true)}>
      Vis ${hidden === 1 ? "én kommentar til" : `${hidden} kommentarer til`}
    </button>`}
    ${post.comments.slice(hidden).map(
      (c) => html`<div class="comment" key=${c.id}>
        <${Avatar} name=${c.houseName} id=${c.houseId} size=${30} />
        <div class="bubble">
          <div class="comment-head">
            <strong>${c.houseName}</strong>${c.author && html`<span class="muted"> · ${c.author}</span>`}
            <span class="muted small" title=${fullTime(c.createdAt)}> · ${timeAgo(c.createdAt)}</span>
          </div>
          <div class="comment-body">${linkify(c.body)}</div>
        </div>
        ${(c.houseId === cfg.me.id || cfg.me.isAdmin) &&
        html`<button type="button" class="icon-btn sm" aria-label="Slett kommentaren" onClick=${() => remove(c)}>
          <${Icon} name="trash" size=${16} />
        </button>`}
      </div>`,
    )}
    <form class="comment-form" onSubmit=${send}>
      <input class="input" maxlength="2000" value=${text} placeholder="Skriv en kommentar …" aria-label="Skriv en kommentar"
        autofocus=${focus} onInput=${(e) => setText(e.currentTarget.value)} />
      <button class="icon-btn accent" aria-label="Send kommentaren" disabled=${busy || !text.trim()}>
        <${Icon} name="send" size=${18} />
      </button>
    </form>
  </div>`;
}

// The next few activities, so the front page shows what is coming.
function NextEvents({ cfg }) {
  const [events, setEvents] = useState(null);
  useEffect(() => {
    api("/api/events").then((r) => {
      const today = todayISO();
      setEvents(r.events.filter((e) => eventLastDay(e) >= today).slice(0, 3));
    }, () => setEvents([]));
  }, []);
  if (events === null) return null;

  return html`<div class="card next-events">
    <div class="card-title">
      <h2>Neste aktiviteter</h2>
      <a href="/kalender" class="small">Hele kalenderen</a>
    </div>
    ${events.length === 0
      ? html`<p class="muted small">Ingenting planlagt ennå. <a href="/kalender">Legg til en aktivitet</a>.</p>`
      : events.map((e) => {
          const cat = byId(cfg.eventCategories, e.category);
          return html`<a href=${`/kalender?aktivitet=${e.id}`} class="mini-event" key=${e.id}>
            <span class="date-chip" style=${{ "--c": cat?.color }}>
              <span>${formatDay(e.startDate, { month: "short" }).replace(".", "")}</span>
              <strong>${Number(e.startDate.slice(8))}</strong>
            </span>
            <span>
              <strong>${cat?.icon} ${e.title}</strong>
              <span class="muted small block">${eventWhen(e)}</span>
            </span>
          </a>`;
        })}
  </div>`;
}
