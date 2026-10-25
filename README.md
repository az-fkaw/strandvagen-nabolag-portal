# Strandvågen nabolagsportal

A private website for the neighbourhood, in Norwegian: a wall for posts, a
shared calendar (dugnad, social, meetings), a list of who lives where, and
useful links. Each house has one login, shared by everyone living there. One
or more houses are administrators.

It runs on Cloudflare's free plan: one Worker and one D1 database.

## How it is built

```
browser ── /, /kalender, /naboer ... ──► public/          (pages, served as files)
        └─ /api/* ─────────────────────► src/worker.js    (rules) ──► D1 database
```

- **No build step.** The pages are plain JavaScript modules using Preact + htm
  (one vendored file, `public/js/vendor/preact-htm.js`). What is in `public/`
  is what the browser gets.
- **The HTML holds no content.** `public/index.html` is an empty frame; names,
  categories, colours, houses, posts and links come from the server.
- **No passwords in plain text, no tracking, no third-party scripts.** Pages are
  marked `noindex`; everything except the login page needs a login.

## Where to change what

| To change | Edit | Who |
|---|---|---|
| Portal name, subtitle, welcome text, colour theme | **Admin** page in the portal | administrator |
| Houses, invitations, who is administrator | **Admin** page | administrator |
| Useful links | **Lenker** page (edit buttons appear for the administrator) | administrator |
| Moderating posts, comments, activities | On the post itself (Rediger / Slett / Fest) | administrator |
| Post and calendar categories, colour themes, starter links, how long logins and invitations last | `portal.config.js` | developer, then deploy |
| Infrastructure: Worker name, database, routing | `wrangler.jsonc` | developer |
| Who may do what (every API call and its access level) | `ROUTES` at the top of `src/worker.js` | developer |
| The look | `public/style.css` (colour tokens at the top) | developer |
| The app icons (after adding or changing a colour theme) | `npm run icons` redraws `public/icons/` | developer |
| A page | `public/js/pages/<page>.js` | developer |
| The database schema | add `migrations/0002_<name>.sql` (never edit 0001) | developer |

## First time: put it online

You need a free Cloudflare account and Node.js.

```sh
npm install
npx wrangler login                                   # opens the browser once
npx wrangler d1 create nabolag --location weur       # prints a database_id
```

Paste that `database_id` into `wrangler.jsonc` (replacing
`LIM-INN-ID-FRA-wrangler-d1-create`), then:

```sh
npm run deploy
```

It prints the address, `https://strandvagen-nabolag.<your-account>.workers.dev`.
**Open it right away**: the first visitor sets up the portal and becomes its
administrator (this works only while the portal has no houses).

Optional: a nicer address. In the Cloudflare dashboard, Workers → this Worker
→ Settings → Domains & Routes → add a custom domain you own there.

## Day to day (administrator)

- **New houses:** Admin → "Legg til hus", one per line.
- **Inviting a house:** Admin → "Invitasjon" → "Lag invitasjonslenke" → copy
  the ready-made message into an SMS or e-mail. The house opens the link and
  chooses a password (14 days, one use).
- **Forgotten password:** same thing, send a new invitation link.
- **Someone moves:** send the new residents a new invitation link. When they
  use it, every device still logged in as that house is logged out, and they
  can rewrite the house's profile.
- **Handing over:** Admin → the pencil on the new administrator's house →
  tick "Administrator". Then remove your own tick if you like. The portal
  always keeps at least one administrator.

## On phones: the portal as an app

The portal can be installed as an app: an icon on the home screen that opens
it full screen, without the browser's buttons. No app store, no fees, no
notifications. On phones a small hint on the front page leads to the steps
on "Mitt hus" (iPhone: Share → "Legg til på Hjem-skjerm"; Android: Chrome's
⋮ menu → "Installer app"; where the browser offers it, a button does it).

What makes it work: `/api/manifest` (name, colour and icons, from the Admin
page's settings), the icons in `public/icons/`, and `public/sw.js`, which
caches nothing and only shows a friendly page when the phone is offline.
An installed app also redraws itself with fresh data when it is reopened
after more than five minutes.

## Updating the code

```sh
npm test          # starts a throwaway local portal and checks every rule (~20 s)
npm run deploy    # applies new database migrations, then publishes
```

To try changes locally first: `npm run dev`, then open http://localhost:8787.
The local copy has its own empty database (in `.wrangler/`).

## Backups

Cloudflare keeps the database's history (Time Travel: 7 days on the free plan,
30 on paid) and can restore it to any minute:
`npx wrangler d1 time-travel restore nabolag --timestamp <time>`.
For a copy you keep yourself:

```sh
npx wrangler d1 export nabolag --remote --output backup-$(date +%F).sql
```

## Limits and costs

Free plan, per day: 100,000 requests to the API, 5 million database rows read,
100,000 written; 5 GB of storage. Page files are served free and do not
count. A neighbourhood of a hundred houses uses a small fraction of this.

One trade-off was made for the free plan: passwords are hashed with PBKDF2 at
40,000 iterations because the free plan allows 10 ms of CPU per request. On a
paid plan raise `ITERATIONS` in `src/crypto.js`; old passwords upgrade
themselves at the next login.

## Personal data

The neighbour list holds names, phone numbers and e-mail addresses that each
house chooses to fill in. The database lives in Cloudflare's Western Europe
region. Only logged-in houses see any of it. Deleting a house deletes its
posts, comments and activities with it.

## Not built yet (ideas)

Pictures on posts (needs Cloudflare R2, free up to 10 GB but requires a card
on the account), e-mail when something new is posted, a calendar feed phones
can subscribe to, polls. 
