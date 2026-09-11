// Updog.link — the whole application.
//
// Routes:
//   GET  /            landing page with the create form
//   POST /api/links   create a link  {slug, destination, token}
//   GET  /:slug       302 to the destination, or the 404 page
//
// Bindings (see terraform/worker.tf and wrangler.jsonc):
//   LINKS             R2 bucket; one JSON object per link, keyed by slug
//   TURNSTILE_SECRET  server-side key for verifying the bot check
//   TURNSTILE_SITEKEY public key rendered into the form
//   GITHUB_REPO       "owner/name", linked from the page
//   DONATE_URL        optional; donation line is shown only when set

const SLUG_RE = /^[A-Za-z0-9_-]{1,64}$/;
const RESERVED = new Set(["api", "favicon.ico", "robots.txt", "index.html", "404.html"]);
const MAX_DESTINATION_LENGTH = 2048;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const isRead = request.method === "GET" || request.method === "HEAD";

    if (pathname === "/api/links") {
      if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
      return createLink(request, env, url);
    }
    if (!isRead) return json({ error: "Method not allowed." }, 405);
    if (pathname === "/") return html(landingPage(env, url.host));
    if (pathname === "/favicon.ico") return new Response(null, { status: 204 });
    if (pathname === "/robots.txt") return new Response("User-agent: *\nDisallow: /api/\n");

    const slug = pathname.slice(1);
    if (SLUG_RE.test(slug) && !RESERVED.has(slug)) {
      const object = await env.LINKS.get(slug);
      if (object) {
        const { destination } = await object.json();
        return new Response(null, {
          status: 302,
          headers: { Location: destination, "Cache-Control": "no-store" },
        });
      }
    }
    return html(notFoundPage(url.host), 404);
  },
};

async function createLink(request, env, url) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Body must be JSON." }, 400);
  }
  const slug = String(body.slug ?? "").trim();
  const token = String(body.token ?? "");

  if (!SLUG_RE.test(slug)) {
    return json({ error: "Slug must be 1–64 letters, digits, dashes or underscores." }, 400);
  }
  if (RESERVED.has(slug)) return json({ error: "That slug is reserved." }, 400);

  const destination = parseDestination(String(body.destination ?? "").trim(), url.hostname);
  if (!destination) {
    return json({ error: "Destination must be an http(s) URL that doesn't point back here." }, 400);
  }

  const human = await verifyTurnstile(token, env.TURNSTILE_SECRET, request.headers.get("CF-Connecting-IP"));
  if (!human) return json({ error: "Bot check failed. Reload the page and try again." }, 403);

  const record = JSON.stringify({ slug, destination, created_at: new Date().toISOString() });
  const stored = await env.LINKS.put(slug, record, {
    httpMetadata: { contentType: "application/json" },
    onlyIf: new Headers({ "If-None-Match": "*" }), // first come, first served
  });
  if (stored === null) return json({ error: `${url.host}/${slug} is already taken.` }, 409);

  return json({ url: `${url.origin}/${slug}`, destination }, 201);
}

function parseDestination(raw, ownHost) {
  if (!raw || raw.length > MAX_DESTINATION_LENGTH || /\s/.test(raw)) return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  if (parsed.hostname === ownHost || parsed.hostname.endsWith("." + ownHost)) return null;
  return parsed.href;
}

async function verifyTurnstile(token, secret, ip) {
  if (!token) return false;
  const form = new FormData();
  form.append("secret", secret);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
  });
  const data = await res.json();
  return data.success === true;
}

// --- responses ---------------------------------------------------------------

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function html(markup, status = 200) {
  return new Response(markup, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

// --- pages -------------------------------------------------------------------

const FAVICON =
  "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🐶</text></svg>";

const STYLE = `
  :root { color-scheme: light dark; }
  body { font: 18px/1.5 system-ui, sans-serif; max-width: 42rem; margin: 3rem auto; padding: 0 1.25rem; }
  h1 { font-size: 2.2rem; margin-bottom: 0; }
  h2 { font-size: 1.3rem; margin-top: 2.5rem; }
  form { margin: 1.5rem 0; }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; margin-bottom: 1rem; }
  input[type=text], input[type=url] { font: inherit; padding: .4rem .6rem; border: 2px solid #8885; border-radius: 6px; min-width: 0; }
  #slug { width: 9rem; } #destination { flex: 1 1 16rem; }
  button { font: inherit; padding: .5rem 1.2rem; border: 2px solid #8885; border-radius: 6px; cursor: pointer; }
  #result { min-height: 1.5rem; font-weight: 600; }
  #result a { word-break: break-all; }
  .muted { color: #888; font-size: .9rem; }
  footer { margin-top: 3rem; font-size: .9rem; color: #888; }
`;

function layout(title, body) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="icon" href="${FAVICON}">
<style>${STYLE}</style>
</head>
<body>
${body}
</body>
</html>`;
}

function landingPage(env, host) {
  const repoUrl = `https://github.com/${esc(env.GITHUB_REPO)}`;
  const donate = env.DONATE_URL
    ? `<p>Donations are accepted to cover nominal hosting fees, and any proceeds are forwarded directly to
       <a href="${esc(env.DONATE_URL)}">Girls Who Code</a>.</p>`
    : "";

  return layout(
    "What's Updog?",
    `
<h1>What's Updog? 🐶</h1>
<p class="muted">An ad-free, open-source URL shortener that anyone can deploy and run.</p>

<h2>Create a shortlink to anywhere</h2>
<form id="create">
  <div class="row">
    <label for="slug">${esc(host)}/</label>
    <input type="text" id="slug" name="slug" value="iLoveDavid" maxlength="64" pattern="[A-Za-z0-9_-]+" required>
    <span>→</span>
    <input type="url" id="destination" name="destination" value="https://github.com/${esc(env.GITHUB_REPO)}" required>
  </div>
  <div class="row">
    <div class="cf-turnstile" data-sitekey="${esc(env.TURNSTILE_SITEKEY)}"></div>
    <button type="submit">Go! 🐕</button>
  </div>
  <p id="result" aria-live="polite"></p>
</form>
<p class="muted">Links can't be edited once created. To report an abusive link, open an issue <a href="${repoUrl}/issues">on GitHub</a>.</p>

<h2>Why does this exist?</h2>
<p>Aside from being a free shortlink service with a <em><a href="https://www.urbandictionary.com/define.php?term=Sick">sick</a></em> name,
this project is ad-free and doesn't collect information to track you or anyone else.</p>
${donate}
<p>Consider cloning the repository and running your own. It's a compact intro to Infrastructure as Code and serverless cloud
technologies, and you get to have your own shortlink service.</p>

<h2>How do I run my own?</h2>
<p>Deployment takes about ten minutes, start to finish, including reading the instructions. It runs on Cloudflare's free tier,
so serving a few million redirects a month costs nothing.</p>
<p><a href="${repoUrl}">The README on GitHub</a> has the steps.</p>

<h2>But no, really, what is "Updog?"</h2>
<p><a href="https://knowyourmeme.com/memes/updog">Nothin' much. What's up with you?</a></p>

<footer>Updog.link is a silly pet project. <a href="${repoUrl}">Source on GitHub</a>.</footer>

<script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
<script>
  const form = document.getElementById("create");
  const result = document.getElementById("result");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    result.textContent = "Working…";
    let res, body;
    try {
      res = await fetch("/api/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug: data.get("slug"),
          destination: data.get("destination"),
          token: data.get("cf-turnstile-response"),
        }),
      });
      body = await res.json();
    } catch {
      body = { error: "Something went wrong. Try again." };
    }
    result.textContent = "";
    if (res && res.ok) {
      const a = document.createElement("a");
      a.href = body.url;
      a.textContent = body.url;
      result.append("Done: ", a);
    } else {
      result.textContent = body.error || "Something went wrong.";
    }
    if (window.turnstile) turnstile.reset();
  });
</script>
`
  );
}

function notFoundPage(host) {
  return layout(
    "404 · What's Updog?",
    `
<h1>404 🐕</h1>
<p>Nothin' much here. That shortlink doesn't exist.</p>
<p><a href="/">Make one at ${esc(host)}</a></p>
`
  );
}
