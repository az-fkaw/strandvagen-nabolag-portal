// Before login: logging in, the very first setup, and invitation links.
import { html, useEffect, useState } from "../vendor/preact-htm.js";
import { BrandMark, Field, Loading, PasswordInput, api, byName, navigate, recall, remember } from "../lib.js";

function AuthCard({ cfg, title, children }) {
  return html`<div class="auth">
    <div class="auth-card card">
      <div class="auth-head">
        <${BrandMark} size=${56} />
        <h1>${title || cfg.name}</h1>
        ${!title && cfg.tagline && html`<p class="muted">${cfg.tagline}</p>`}
      </div>
      ${children}
    </div>
  </div>`;
}

// Submits `request()`; shows its error under the form.
function useSubmit(request, onDone) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await request();
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };
  return [submit, busy, error];
}

const FormError = ({ error }) => error && html`<p class="form-error" role="alert">${error}</p>`;

export function LoginPage({ cfg, onDone }) {
  const houses = [...cfg.houses].sort(byName);
  const last = recall("nabolag:hus");
  const [houseId, setHouseId] = useState(houses.some((h) => String(h.id) === last) ? last : "");
  const [password, setPassword] = useState("");
  const [submit, busy, error] = useSubmit(async () => {
    await api("/api/login", { method: "POST", body: { houseId: Number(houseId), password } });
    remember("nabolag:hus", houseId);
  }, onDone);

  return html`<${AuthCard} cfg=${cfg}>
    <form class="stack" onSubmit=${submit}>
      <${Field} label="Huset ditt">
        <select class="input" required value=${houseId} onChange=${(e) => setHouseId(e.currentTarget.value)}>
          <option value="" disabled>Velg huset ditt …</option>
          ${houses.map((h) => html`<option key=${h.id} value=${h.id}>${h.name}</option>`)}
        </select>
      <//>
      <${Field} label="Passord">
        <${PasswordInput} value=${password} onInput=${setPassword} />
      <//>
      <${FormError} error=${error} />
      <button class="btn primary block" disabled=${busy}>${busy ? "Logger inn …" : "Logg inn"}</button>
    </form>
    <p class="hint center">
      Har dere ikke passord ennå, eller har dere glemt det? Be administratoren om en invitasjonslenke.
    </p>
  <//>`;
}

export function SetupPage({ cfg, onDone }) {
  const [house, setHouse] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [submit, busy, error] = useSubmit(async () => {
    if (password !== repeat) throw new Error("Passordene er ikke like.");
    await api("/api/setup", { method: "POST", body: { house, password } });
  }, onDone);

  return html`<${AuthCard} cfg=${cfg} title="Sett opp nabolagsportalen">
    <p class="muted">
      Du blir administrator. Etterpå legger du til de andre husene og sender dem en invitasjonslenke.
    </p>
    <form class="stack" onSubmit=${submit}>
      <${Field} label="Ditt hus" hint="Slik naboene kjenner det, for eksempel «Strandvågen 12».">
        <input class="input" required maxlength="60" value=${house} onInput=${(e) => setHouse(e.currentTarget.value)} />
      <//>
      <${Field} label="Velg et passord" hint="Minst 8 tegn.">
        <${PasswordInput} value=${password} onInput=${setPassword} autocomplete="new-password" />
      <//>
      <${Field} label="Gjenta passordet">
        <${PasswordInput} value=${repeat} onInput=${setRepeat} autocomplete="new-password" />
      <//>
      <${FormError} error=${error} />
      <button class="btn primary block" disabled=${busy}>Opprett og logg inn</button>
    </form>
  <//>`;
}

export function InvitePage({ cfg, token, onDone }) {
  const [house, setHouse] = useState(null);
  const [gone, setGone] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  useEffect(() => {
    api(`/api/invite/${token}`).then((r) => setHouse(r.house), (e) => setGone(e.message));
  }, [token]);
  const [submit, busy, error] = useSubmit(
    async () => {
      if (password !== repeat) throw new Error("Passordene er ikke like.");
      await api(`/api/invite/${token}`, { method: "POST", body: { password } });
    },
    () => {
      history.replaceState(null, "", "/");
      onDone();
    },
  );

  if (gone)
    return html`<${AuthCard} cfg=${cfg} title="Lenken virker ikke">
      <p class="muted">${gone}</p>
      <a class="btn block" href="/">Til innloggingen</a>
    <//>`;
  if (!house) return html`<div class="boot"><${Loading} /></div>`;

  return html`<${AuthCard} cfg=${cfg} title=${`Velkommen, ${house}!`}>
    <p class="muted">
      Velg et passord for huset. Alle som bor hos dere kan bruke det samme passordet, på mobil og PC.
    </p>
    <form class="stack" onSubmit=${submit}>
      <${Field} label="Velg et passord" hint="Minst 8 tegn. Skriv det gjerne ned et trygt sted.">
        <${PasswordInput} value=${password} onInput=${setPassword} autocomplete="new-password" autofocus />
      <//>
      <${Field} label="Gjenta passordet">
        <${PasswordInput} value=${repeat} onInput=${setRepeat} autocomplete="new-password" />
      <//>
      <${FormError} error=${error} />
      <button class="btn primary block" disabled=${busy}>Lagre og logg inn</button>
    </form>
  <//>`;
}

// An invitation opened on a device that is already logged in (often the
// administrator testing a link).
export function LoggedInInvite({ cfg, onDone }) {
  const logout = async () => {
    await api("/api/logout", { method: "POST", body: {} });
    onDone();
  };
  return html`<div class="card narrow stack">
    <h2>Du er allerede logget inn</h2>
    <p>
      Denne enheten er logget inn som <strong>${cfg.me.name}</strong>. Er invitasjonen til et annet hus? Logg ut
      først, og åpne lenken på nytt.
    </p>
    <div class="row">
      <button class="btn" onClick=${() => navigate("/")}>Til forsiden</button>
      <button class="btn primary" onClick=${logout}>Logg ut og bruk invitasjonen</button>
    </div>
  </div>`;
}
