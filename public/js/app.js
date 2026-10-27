// The frame around every page: which page an address shows, the menus,
// and the login gate. The pages themselves live in pages/.
import { html, render, useEffect, useState } from "./vendor/preact-htm.js";
import { Avatar, BrandMark, Icon, Loading, Toaster, api, navigate } from "./lib.js";
import { WallPage } from "./pages/wall.js";
import { CalendarPage } from "./pages/calendar.js";
import { NeighboursPage } from "./pages/neighbours.js";
import { LinksPage } from "./pages/links.js";
import { MyHousePage } from "./pages/myhouse.js";
import { AdminPage } from "./pages/admin.js";
import { InvitePage, LoggedInInvite, LoginPage, SetupPage } from "./pages/login.js";
import { refreshNews, useNews } from "./news.js";

// Lets phones install the portal as an app; it caches nothing (public/sw.js).
navigator.serviceWorker?.register("/sw.js").catch(() => {});

// The menu, in order. `admin` pages show only to administrators; `news`
// names the count of new things shown on the menu item (news.js).
const PAGES = [
  { path: "/", label: "Oppslag", icon: "chat", component: WallPage, news: "wall" },
  { path: "/kalender", label: "Kalender", icon: "calendar", component: CalendarPage, news: "calendar" },
  { path: "/naboer", label: "Naboer", icon: "users", component: NeighboursPage },
  { path: "/lenker", label: "Lenker", icon: "link", component: LinksPage },
  { path: "/admin", label: "Admin", icon: "shield", component: AdminPage, admin: true },
];
const MY_HOUSE = { path: "/mitt-hus", label: "Mitt hus", component: MyHousePage };

// Links inside the portal change page without reloading it.
document.addEventListener("click", (e) => {
  const a = e.target.closest("a[href]");
  if (!a || a.target || a.hasAttribute("download") || a.origin !== location.origin) return;
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  e.preventDefault();
  navigate(a.pathname + a.search);
});

function usePath() {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const update = () => setPath(location.pathname);
    addEventListener("popstate", update);
    addEventListener("nabolag:naviger", update);
    return () => {
      removeEventListener("popstate", update);
      removeEventListener("nabolag:naviger", update);
    };
  }, []);
  return path;
}

function applyTheme(cfg) {
  const theme = cfg.themes.find((t) => t.id === cfg.theme) || cfg.themes[0];
  const head = (selector, attribute, value) => document.querySelector(selector)?.setAttribute(attribute, value);
  document.documentElement.style.setProperty("--accent", theme.accent);
  head('meta[name="theme-color"]', "content", theme.accent);
  head('meta[name="apple-mobile-web-app-title"]', "content", cfg.name);
  head('link[rel="icon"]', "href", `/icons/${theme.id}-192.png`);
  head('link[rel="apple-touch-icon"]', "href", `/icons/${theme.id}-180.png`);
}

// An installed app has no reload button and can sit in the background for
// days: coming back after a while redraws the page with fresh data, unless
// something is half-written or a dialog is open.
const STALE_MS = 5 * 60_000;
const midEdit = () =>
  document.querySelector("dialog[open]") ||
  [...document.querySelectorAll("textarea, input:not([type]), input[type=text]")].some((el) => el.value.trim());

function useFreshOnReturn(reload) {
  const [round, setRound] = useState(0);
  useEffect(() => {
    let hiddenAt = 0;
    const onChange = () => {
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > STALE_MS && !midEdit()) {
        reload();
        setRound((n) => n + 1);
      }
    };
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);
  return round;
}

function App() {
  const path = usePath();
  const [cfg, setCfg] = useState(null);
  const [error, setError] = useState("");

  const reload = () =>
    api("/api/config")
      .then((c) => {
        applyTheme(c);
        setCfg(c);
        setError("");
      })
      .catch((e) => setError(e.message));

  useEffect(() => {
    reload();
    addEventListener("nabolag:logget-ut", reload);
    return () => removeEventListener("nabolag:logget-ut", reload);
  }, []);
  const round = useFreshOnReturn(reload);
  const news = useNews();
  useEffect(() => {
    if (cfg?.me) refreshNews();
  }, [path, round, cfg?.me?.id]);

  if (error)
    return html`<div class="boot">
      <p>${error}</p>
      <button class="btn primary" onClick=${reload}>Prøv igjen</button>
    </div>`;
  if (!cfg) return html`<div class="boot"><${Loading} /></div>`;

  const invite = path.match(/^\/invitasjon\/([\w-]+)$/);
  if (!cfg.me) {
    document.title = cfg.name;
    if (invite) return html`<${InvitePage} cfg=${cfg} token=${invite[1]} onDone=${reload} />`;
    if (cfg.needsSetup) return html`<${SetupPage} cfg=${cfg} onDone=${reload} />`;
    return html`<${LoginPage} cfg=${cfg} onDone=${reload} />`;
  }

  const menu = PAGES.filter((p) => !p.admin || cfg.me.isAdmin);
  const badge = (p) => {
    const n = p.news && news[p.news];
    return n ? html`<span class="nav-badge" aria-label=${`${n} nye`}>${n > 9 ? "9+" : n}</span>` : null;
  };
  const page = invite ? null : path === MY_HOUSE.path ? MY_HOUSE : menu.find((p) => p.path === path);
  document.title = page ? `${page.label} · ${cfg.name}` : cfg.name;

  return html`
    <header class="topbar">
      <div class="topbar-inner">
        <a href="/" class="brand">
          <${BrandMark} />
          <span class="brand-text"><strong>${cfg.name}</strong>${cfg.tagline && html`<small>${cfg.tagline}</small>`}</span>
        </a>
        <nav class="topnav" aria-label="Hovedmeny">
          ${menu.map((p) => html`<a href=${p.path} key=${p.path} aria-current=${p.path === path ? "page" : null}>${p.label}${badge(p)}</a>`)}
        </nav>
        <a href="/mitt-hus" class="me" aria-current=${path === MY_HOUSE.path ? "page" : null} title="Mitt hus og innstillinger">
          <${Avatar} name=${cfg.me.name} id=${cfg.me.id} size=${34} />
          <span class="me-name">${cfg.me.name}</span>
        </a>
      </div>
    </header>
    <main class="page">
      ${invite
        ? html`<${LoggedInInvite} cfg=${cfg} onDone=${reload} />`
        : page
          ? html`<${page.component} key=${`${page.path}:${round}`} cfg=${cfg} reload=${reload} />`
          : html`<div class="empty">
              <div class="empty-icon">🧭</div>
              <h3>Denne siden finnes ikke</h3>
              <p><a href="/">Gå til oppslagstavla</a></p>
            </div>`}
    </main>
    <nav class="bottomnav" aria-label="Hovedmeny">
      ${menu.map(
        (p) => html`<a href=${p.path} key=${p.path} aria-current=${p.path === path ? "page" : null}>
          <span class="nav-icon"><${Icon} name=${p.icon} size=${22} />${badge(p)}</span><span>${p.label}</span>
        </a>`,
      )}
    </nav>`;
}

render(html`<${App} /><${Toaster} />`, document.getElementById("app"));
