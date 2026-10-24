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

// The menu, in order. `admin` pages show only to administrators.
const PAGES = [
  { path: "/", label: "Oppslag", icon: "chat", component: WallPage },
  { path: "/kalender", label: "Kalender", icon: "calendar", component: CalendarPage },
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
  document.documentElement.style.setProperty("--accent", theme.accent);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.accent);
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
          ${menu.map((p) => html`<a href=${p.path} key=${p.path} aria-current=${p.path === path ? "page" : null}>${p.label}</a>`)}
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
          ? html`<${page.component} key=${page.path} cfg=${cfg} reload=${reload} />`
          : html`<div class="empty">
              <div class="empty-icon">🧭</div>
              <h3>Denne siden finnes ikke</h3>
              <p><a href="/">Gå til oppslagstavla</a></p>
            </div>`}
    </main>
    <nav class="bottomnav" aria-label="Hovedmeny">
      ${menu.map(
        (p) => html`<a href=${p.path} key=${p.path} aria-current=${p.path === path ? "page" : null}>
          <${Icon} name=${p.icon} size=${22} /><span>${p.label}</span>
        </a>`,
      )}
    </nav>`;
}

render(html`<${App} /><${Toaster} />`, document.getElementById("app"));
