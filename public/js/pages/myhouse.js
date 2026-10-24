// The house's own page: its profile for the neighbours, the password,
// this device's name on posts, and logging out.
import { html, useEffect, useState } from "../vendor/preact-htm.js";
import { Avatar, Field, Icon, Loading, PasswordInput, api, byId, recall, remember, showError, toast, useForm } from "../lib.js";

export function MyHousePage({ cfg, reload }) {
  const [house, setHouse] = useState(null);
  useEffect(() => {
    api("/api/houses").then((r) => setHouse(byId(r.houses, cfg.me.id)), showError);
  }, []);
  if (!house) return html`<${Loading} />`;

  const logout = async () => {
    await api("/api/logout", { method: "POST", body: {} }).catch(showError);
    history.replaceState(null, "", "/");
    reload();
  };

  return html`<div class="narrow stack-lg">
    <div class="page-head">
      <${Avatar} name=${cfg.me.name} id=${cfg.me.id} size=${52} />
      <div>
        <h1>${cfg.me.name}</h1>
        <span class="muted">${cfg.me.isAdmin ? "Administrator for portalen" : "Ditt hus"}</span>
      </div>
    </div>
    <${Profile} house=${house} />
    <${DeviceName} />
    <${Password} />
    <div class="card stack">
      <h2>Logg ut</h2>
      <p class="muted">Logger ut bare denne enheten. Du trenger passordet for å komme inn igjen.</p>
      <div><button class="btn" onClick=${logout}><${Icon} name="logout" size=${18} /> Logg ut</button></div>
    </div>
  </div>`;
}

function Profile({ house }) {
  const [form, , bind] = useForm({ residents: house.residents, phone: house.phone, email: house.email, about: house.about });
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    await api(`/api/houses/${house.id}`, { method: "PUT", body: form }).then(() => toast("Lagret – naboene ser det nå"), showError);
    setBusy(false);
  };
  return html`<form class="card stack" onSubmit=${save}>
    <div>
      <h2>Om huset</h2>
      <p class="muted small">Dette ser naboene på siden «Naboer». Alt er valgfritt.</p>
    </div>
    <${Field} label="Hvem bor her?" hint="For eksempel «Kari og Ola, Emma (8) og katten Pus».">
      <input class="input" maxlength="200" ...${bind("residents")} />
    <//>
    <div class="grid-2">
      <${Field} label="Telefon"><input class="input" type="tel" maxlength="40" autocomplete="tel" ...${bind("phone")} /><//>
      <${Field} label="E-post"><input class="input" type="email" maxlength="120" autocomplete="email" ...${bind("email")} /><//>
    </div>
    <${Field} label="Litt om oss" hint="Hva kan dere hjelpe naboene med? Har dere tilhenger, stige eller grønne fingre?">
      <textarea class="input" rows="3" maxlength="1000" ...${bind("about")}></textarea>
    <//>
    <div class="row end"><button class="btn primary" disabled=${busy}>Lagre</button></div>
  </form>`;
}

function DeviceName() {
  const [name, setName] = useState(recall("nabolag:navn"));
  const save = (e) => {
    e.preventDefault();
    remember("nabolag:navn", name.trim());
    toast("Navnet er lagret på denne enheten");
  };
  return html`<form class="card stack" onSubmit=${save}>
    <div>
      <h2>Ditt navn på innlegg</h2>
      <p class="muted small">
        Alle i huset bruker samme innlogging. Skriv navnet ditt her, så står det på innlegg og kommentarer du skriver
        fra denne mobilen eller PC-en.
      </p>
    </div>
    <div class="row">
      <input class="input" maxlength="60" placeholder="For eksempel «Kari»" value=${name} aria-label="Ditt navn"
        onInput=${(e) => setName(e.currentTarget.value)} />
      <button class="btn">Lagre</button>
    </div>
  </form>`;
}

function Password() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [repeat, setRepeat] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    if (next !== repeat) return showError(new Error("De nye passordene er ikke like."));
    setBusy(true);
    try {
      await api("/api/password", { method: "POST", body: { current, password: next } });
      setCurrent("");
      setNext("");
      setRepeat("");
      toast("Passordet er endret. Andre enheter må logge inn på nytt.");
    } catch (err) {
      showError(err);
    }
    setBusy(false);
  };
  return html`<form class="card stack" onSubmit=${save}>
    <div>
      <h2><${Icon} name="key" size=${20} /> Bytt passord</h2>
      <p class="muted small">Husk å fortelle det nye passordet til de andre i huset.</p>
    </div>
    <${Field} label="Nåværende passord"><${PasswordInput} value=${current} onInput=${setCurrent} /><//>
    <div class="grid-2">
      <${Field} label="Nytt passord" hint="Minst 8 tegn.">
        <${PasswordInput} value=${next} onInput=${setNext} autocomplete="new-password" />
      <//>
      <${Field} label="Gjenta nytt passord">
        <${PasswordInput} value=${repeat} onInput=${setRepeat} autocomplete="new-password" />
      <//>
    </div>
    <div class="row end"><button class="btn primary" disabled=${busy}>Bytt passord</button></div>
  </form>`;
}
