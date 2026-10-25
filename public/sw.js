// The service worker: what lets a phone install the portal as an app. It
// keeps no copies of anything, so a new deploy reaches everyone at once,
// and it sends no notifications. Its one job: when the phone has no
// connection, show a friendly page instead of the browser's error.

const OFFLINE_PAGE = `<!doctype html>
<html lang="nb"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Ingen nettforbindelse</title></head>
<body style="margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;box-sizing:border-box;
  font:17px/1.5 system-ui,-apple-system,sans-serif;text-align:center;background:#f2eee7;color:#1c2630">
  <div>
    <div style="font-size:48px">📡</div>
    <h1 style="font-size:22px;margin:8px 0">Ingen nettforbindelse</h1>
    <p>Nabolagsportalen trenger internett. Sjekk Wi-Fi eller mobildata, og prøv igjen.</p>
    <button onclick="location.reload()" style="font:inherit;font-weight:600;padding:12px 24px;border:0;
      border-radius:999px;background:#1c2630;color:#fff">Prøv igjen</button>
  </div>
</body></html>`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate") return; // everything else: the browser as usual
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(OFFLINE_PAGE, { headers: { "Content-Type": "text/html; charset=utf-8" } }),
    ),
  );
});
