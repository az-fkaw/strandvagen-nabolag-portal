// Installing the portal as an app: an icon on the phone's home screen that
// opens it full screen. Nothing more; it sends no notifications.
import { html, useEffect, useState } from "./vendor/preact-htm.js";
import { Icon, recall, remember } from "./lib.js";

// Chrome and Edge (Android, PC) offer their own install dialog. Keep it for
// our "Installer appen" button instead of letting the browser pop it up.
let browserPrompt = null;
const listeners = new Set();
const changed = () => listeners.forEach((fn) => fn());
addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  browserPrompt = e;
  changed();
});
addEventListener("appinstalled", () => {
  browserPrompt = null;
  changed();
});

export const isInstalled = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const isApple = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isTouch = () => matchMedia("(pointer: coarse)").matches;

function useBrowserPrompt() {
  const [, redraw] = useState(0);
  useEffect(() => {
    const fn = () => redraw((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
  return browserPrompt;
}

// The how-to, at the top of "Mitt hus" until the portal is installed here.
export function AppCard({ cfg }) {
  const prompt = useBrowserPrompt();
  if (isInstalled()) return null;
  const install = async () => {
    prompt.prompt();
    await prompt.userChoice;
    browserPrompt = null;
    changed();
  };
  return html`<section class="card stack app-card">
    <div class="row">
      <img class="app-icon" src=${`/icons/${cfg.theme}-192.png`} width="52" height="52" alt="" />
      <div>
        <h2>Få portalen som app</h2>
        <p class="muted small">Et ikon på hjemskjermen som åpner portalen direkte, uten nettleserens knapper.
          Ingen appbutikk, og ingen varsler.</p>
      </div>
    </div>
    ${prompt
      ? html`<div><button class="btn primary" onClick=${install}><${Icon} name="download" size=${18} /> Installer appen</button></div>`
      : isApple()
        ? html`<ol class="steps">
            <li>Trykk på Del-knappen <span class="key"><${Icon} name="share" size=${16} /></span> i Safari (nederst eller øverst på skjermen).</li>
            <li>Bla ned og velg <strong>Legg til på Hjem-skjerm</strong>.</li>
            <li>Trykk <strong>Legg til</strong>. Ikonet ligger nå på hjemskjermen.</li>
            <li>Åpne appen fra ikonet. Første gang kan den be deg logge inn én gang til.</li>
          </ol>`
        : html`<ol class="steps">
            <li>Trykk på menyen <span class="key">⋮</span> øverst til høyre i Chrome.</li>
            <li>Velg <strong>Installer app</strong> eller <strong>Legg til på startskjermen</strong>.</li>
            <li>Bekreft. Ikonet ligger nå på startskjermen.</li>
          </ol>`}
  </section>`;
}

const TIP_KEY = "nabolag:app-tips";

// A small hint on the front page, on phones only, until installed or closed.
export function AppTip() {
  const [closed, setClosed] = useState(recall(TIP_KEY) === "lukket");
  if (closed || isInstalled() || !isTouch()) return null;
  const close = () => {
    remember(TIP_KEY, "lukket");
    setClosed(true);
  };
  return html`<div class="card app-tip">
    <span aria-hidden="true">📱</span>
    <a href="/mitt-hus">Få portalen som app på telefonen</a>
    <button type="button" class="icon-btn sm" aria-label="Skjul tipset" onClick=${close}><${Icon} name="x" size=${16} /></button>
  </div>`;
}
