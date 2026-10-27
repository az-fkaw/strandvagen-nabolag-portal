// The front page: a greeting, then the board of posts.
import { html, useEffect, useRef, useState } from "../vendor/preact-htm.js";
import {
  Avatar, Badge, Chips, Empty, Field, Icon, ImageViewer, Loading, Modal, SearchBox,
  api, byId, fullTime, hourInNorway, linkify, recall, remember, sendImage, showError, timeAgo, toast,
  useDebounced,
} from "../lib.js";
import { AppTip } from "../install.js";
import { markSeen, seenSince } from "../news.js";

// The optional "who in the house wrote this", remembered per device.
const NAME_KEY = "nabolag:navn";

export function WallPage({ cfg }) {
  const [category, setCategory] = useState("");
  const [house, setHouse] = useState(null);
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim());
  const [posts, setPosts] = useState(null);
  const [more, setMore] = useState(false);
  const [writing, setWriting] = useState(false);
  // What was new when the page opened stays marked while it is open.
  const [since] = useState(() => seenSince("wall"));

  const load = (offset = 0) => {
    const params = new URLSearchParams({ offset });
    if (category) params.set("category", category);
    if (house) params.set("house", house.id);
    if (q) params.set("q", q);
    return api(`/api/posts?${params}`).then((r) => {
      setPosts((old) => (offset ? [...old, ...r.posts] : r.posts));
      setMore(r.more);
      markSeen("wall", r.now);
    }, showError);
  };
  useEffect(() => {
    setPosts(null);
    load();
  }, [category, house, q]);

  const replace = (post) => setPosts((ps) => ps.map((p) => (p.id === post.id ? post : p)));
  const remove = (id) => setPosts((ps) => ps.filter((p) => p.id !== id));
  const filtered = category || house || q;
  const posted = (post) => {
    setWriting(false);
    if (filtered) {
      setCategory("");
      setHouse(null);
      setQuery("");
    } else setPosts((ps) => [...ps.filter((x) => x.pinned), post, ...ps.filter((x) => !x.pinned)]);
  };

  return html`<div class="wall">
    <${Hero} cfg=${cfg} />
    <${AppTip} />

    <div class="section-head">
      <h2>Oppslagstavla</h2>
      <button class="btn primary" onClick=${() => setWriting(true)}><${Icon} name="plus" size=${18} /> Nytt innlegg</button>
    </div>

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
            (p) => html`<${PostCard} key=${p.id} post=${p} cfg=${cfg} since=${since}
              onChange=${replace} onDelete=${remove} onHouse=${(h) => setHouse(h)} />`,
          )}
    ${more && html`<button class="btn block" onClick=${() => load(posts.length)}>Vis flere innlegg</button>`}

    ${writing && html`<${Composer} cfg=${cfg} onClose=${() => setWriting(false)} onPosted=${posted} />`}
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

// "Nytt innlegg": words, pictures (sent while the writer goes on writing),
// a category and an optional name.
function Composer({ cfg, onClose, onPosted }) {
  const [body, setBody] = useState("");
  const [category, setCategory] = useState(cfg.postCategories[0].id);
  const [author, setAuthor] = useState(recall(NAME_KEY));
  const [pictures, setPictures] = useState([]); // { key, preview, id once sent }
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const previews = useRef([]);
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const max = cfg.images.maxPerPost;
  const sending = pictures.some((p) => !p.id);
  const empty = !body.trim() && !pictures.length;

  const add = (files) => {
    const room = max - pictures.length;
    if (files.length > room) toast(`Et innlegg kan ha høyst ${max} bilder.`, "error");
    for (const file of [...files].slice(0, room)) {
      const key = Math.random();
      const preview = URL.createObjectURL(file);
      previews.current.push(preview);
      setPictures((ps) => [...ps, { key, preview }]);
      sendImage(file, cfg.images).then(
        (image) => setPictures((ps) => ps.map((p) => (p.key === key ? { ...p, id: image.id } : p))),
        (err) => {
          setPictures((ps) => ps.filter((p) => p.key !== key));
          showError(err);
        },
      );
    }
  };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const post = await api("/api/posts", {
        method: "POST",
        body: { body, category, author, images: pictures.map((p) => p.id) },
      });
      remember(NAME_KEY, author.trim());
      toast("Innlegget er publisert");
      onPosted(post);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return html`<${Modal} title="Nytt innlegg" onClose=${onClose}
      mayClose=${() => empty || busy || confirm("Forkaste innlegget du har begynt på?")}>
    <form class="stack" onSubmit=${submit}>
      <textarea class="input" rows="5" maxlength="5000" value=${body} autofocus
        placeholder="Hva vil du dele med naboene?" aria-label="Innlegget"
        onInput=${(e) => setBody(e.currentTarget.value)}></textarea>

      <div class="pictures">
        ${pictures.map(
          (p) => html`<div class="picture" key=${p.key}>
            <img src=${p.preview} alt="" />
            ${!p.id && html`<span class="picture-wait"><span class="spinner"></span></span>`}
            <button type="button" class="picture-remove" aria-label="Fjern bildet"
              onClick=${() => setPictures((ps) => ps.filter((x) => x.key !== p.key))}><${Icon} name="x" size=${14} /></button>
          </div>`,
        )}
        ${pictures.length < max && html`<label class="picture-add">
          <input type="file" accept="image/*" multiple class="visually-hidden"
            onChange=${(e) => { add(e.currentTarget.files); e.currentTarget.value = ""; }} />
          <${Icon} name="image" size=${22} /><span>Legg til bilde</span>
        </label>`}
      </div>

      <div class="field">
        <span class="field-label">Kategori</span>
        <${Chips} label="Kategori" value=${category} onChange=${setCategory} options=${cfg.postCategories} />
      </div>
      <${Field} label="Ditt navn (valgfritt)" hint="Huskes på denne enheten.">
        <input class="input" maxlength="60" value=${author} onInput=${(e) => setAuthor(e.currentTarget.value)} />
      <//>
      ${error && html`<p class="form-error" role="alert">${error}</p>`}
      <div class="row end">
        <button type="button" class="btn ghost" onClick=${() => (empty || confirm("Forkaste innlegget du har begynt på?")) && onClose()}>Avbryt</button>
        <button class="btn primary" disabled=${busy || sending || empty}>${sending ? "Sender bilder …" : "Publiser"}</button>
      </div>
    </form>
  <//>`;
}

function PostImages({ images }) {
  const [open, setOpen] = useState(null);
  return html`<div class=${`post-images n${images.length}`}>
      ${images.map(
        (im, i) => html`<button type="button" class="post-image" key=${im.id} onClick=${() => setOpen(i)}
          aria-label=${images.length > 1 ? `Vis bilde ${i + 1} av ${images.length} større` : "Vis bildet større"}>
          <img src=${`/api/images/${im.id}`} width=${im.width} height=${im.height} loading="lazy" decoding="async" alt="" />
        </button>`,
      )}
    </div>
    ${open !== null && html`<${ImageViewer} images=${images} start=${open} onClose=${() => setOpen(null)} />`}`;
}

// Long posts fold after this many characters or lines.
const FOLD_CHARS = 600;
const FOLD_LINES = 10;

// New to this device: written by another house after it last looked.
const isNew = (item, cfg, since) => !!since && item.houseId !== cfg.me.id && item.createdAt > since;

function PostCard({ post, cfg, since, onChange, onDelete, onHouse }) {
  const me = cfg.me;
  const mine = post.houseId === me.id;
  const canEdit = mine || me.isAdmin;
  const [editing, setEditing] = useState(false);
  const [replying, setReplying] = useState(false);
  const [unfolded, setUnfolded] = useState(false);
  const long = post.body.length > FOLD_CHARS || post.body.split("\n").length > FOLD_LINES;
  const fresh = isNew(post, cfg, since);
  const freshComments = post.comments.filter((c) => isNew(c, cfg, since)).length;

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
        ${fresh && html`<span class="badge new">Ny</span>`}
        ${!fresh && freshComments > 0 && html`<span class="badge new">
          ${freshComments} ${freshComments === 1 ? "ny kommentar" : "nye kommentarer"}
        </span>`}
        ${post.pinned && html`<span class="badge pin"><${Icon} name="pin" size=${14} /> Festet</span>`}
        <${Badge} category=${byId(cfg.postCategories, post.category)} />
      </div>
    </header>

    ${editing
      ? html`<${PostEditor} cfg=${cfg} post=${post} onDone=${(p) => { if (p) onChange(p); setEditing(false); }} />`
      : post.body && html`<div class=${`post-body${long && !unfolded ? " folded" : ""}`}>${linkify(post.body)}</div>
          ${long && html`<button type="button" class="link-btn" onClick=${() => setUnfolded(!unfolded)}>
            ${unfolded ? "Vis mindre" : "Les mer"}
          </button>`}`}
    ${post.images.length > 0 && html`<${PostImages} images=${post.images} />`}

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
    html`<${Comments} post=${post} cfg=${cfg} since=${since} onChange=${onChange} focus=${replying} />`}
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
      <button class="btn primary" disabled=${busy || (!body.trim() && !post.images.length)}>Lagre</button>
    </div>
  </form>`;
}

// Long threads show the last few comments until opened.
const COMMENTS_SHOWN = 3;

function Comments({ post, cfg, since, onChange, focus }) {
  const [text, setText] = useState("");
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const fresh = post.comments.filter((c) => isNew(c, cfg, since)).length; // the newest; always shown
  const hidden = all ? 0 : Math.max(0, post.comments.length - Math.max(COMMENTS_SHOWN, fresh));

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
      (c) => html`<div class=${`comment${isNew(c, cfg, since) ? " new" : ""}`} key=${c.id}>
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
