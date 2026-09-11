// Updog.link — the whole application.
//
// Two hostnames, one Worker:
//   <site>/            the landing page with the create form  (whats.updog.link)
//   <apex>/            301 to <site>                          (updog.link)
//   <apex>/:slug       302 to the destination, or the 404 page
//   POST /api/links    create a link  {slug, destination, token}  (both hosts)
//
// Bindings (see terraform/worker.tf and wrangler.jsonc):
//   LINKS             R2 bucket; one JSON object per link, keyed by slug
//   TURNSTILE_SECRET  server-side key for verifying the bot check
//   TURNSTILE_SITEKEY public key rendered into the form
//   GITHUB_REPO       "owner/name", linked from the page
//   DONATE_URL        optional; donation line is shown only when set
//   APEX_HOST         hostname that serves shortlinks. Empty in local dev.
//   SITE_HOST         hostname that serves the landing page. Empty in local dev.

const SLUG_RE = /^[A-Za-z0-9_-]{1,64}$/;
const RESERVED = new Set(["api", "favicon.ico", "robots.txt", "index.html", "404.html"]);
const MAX_DESTINATION_LENGTH = 2048;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const apex = env.APEX_HOST;
    const site = env.SITE_HOST;
    const routed = Boolean(apex && site); // false in local dev, where host is localhost
    const onSite = routed && url.hostname === site;

    // Anything that isn't one of the two hostnames (the workers.dev preview,
    // say) belongs on the apex.
    if (routed && url.hostname !== apex && !onSite) {
      return redirect(`https://${apex}${pathname}${url.search}`, 301);
    }

    if (pathname === "/api/links") {
      if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
      return createLink(request, env, url);
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return json({ error: "Method not allowed." }, 405);
    }
    if (pathname === "/favicon.ico") return new Response(null, { status: 204 });
    if (pathname === "/robots.txt") return new Response("User-agent: *\nDisallow: /api/\n");

    if (pathname === "/") {
      if (onSite || !routed) return html(landingPage(env));
      return redirect(`https://${site}/`, 301);
    }
    // Shortlinks live on the apex. Reaching one via the site host is harmless;
    // send it next door rather than 404ing.
    if (onSite) return redirect(`https://${apex}${pathname}${url.search}`, 301);

    const slug = pathname.slice(1);
    if (SLUG_RE.test(slug) && !RESERVED.has(slug)) {
      const object = await env.LINKS.get(slug);
      if (object) {
        const { destination } = await object.json();
        return redirect(destination, 302, { "Cache-Control": "no-store" });
      }
    }
    return html(notFoundPage(env), 404);
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
  const linkHost = env.APEX_HOST || url.host;

  if (!SLUG_RE.test(slug)) {
    return json({ error: "Slug must be 1–64 letters, digits, dashes or underscores." }, 400);
  }
  if (RESERVED.has(slug)) return json({ error: "That slug is reserved." }, 400);

  const ownHosts = [env.APEX_HOST, env.SITE_HOST, url.hostname].filter(Boolean);
  const destination = parseDestination(String(body.destination ?? "").trim(), ownHosts);
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
  if (stored === null) return json({ error: `${linkHost}/${slug} is already taken.` }, 409);

  const scheme = url.protocol === "http:" && !env.APEX_HOST ? "http" : "https";
  return json({ url: `${scheme}://${linkHost}/${slug}`, destination }, 201);
}

function parseDestination(raw, ownHosts) {
  if (!raw || raw.length > MAX_DESTINATION_LENGTH || /\s/.test(raw)) return null;
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
  const host = parsed.hostname;
  if (ownHosts.some((own) => host === own || host.endsWith("." + own))) return null;
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

function redirect(location, status, extra = {}) {
  return new Response(null, { status, headers: { Location: location, ...extra } });
}

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
  :root { color-scheme: light dark; --line: #8885; --dim: #888; }
  body { font: 18px/1.5 system-ui, sans-serif; max-width: 42rem; margin: 0 auto; padding: 3rem 1.25rem; }
  h1 { font-size: 2.2rem; margin-bottom: 0; }
  h2 { font-size: 1.3rem; margin-top: 2.5rem; }
  a.gh { position: fixed; top: 0; right: 0; padding: .5rem .9rem; font-size: .85rem; font-weight: 600;
         border: 1px solid var(--line); border-top: 0; border-right: 0; border-radius: 0 0 0 8px;
         background: #8881; text-decoration: none; }
  a.gh:hover { background: #8883; }
  form { margin: 1.5rem 0; }
  .row { display: flex; flex-wrap: wrap; align-items: center; gap: .5rem; margin-bottom: 1rem; }
  input[type=text], input[type=url] { font: inherit; padding: .4rem .6rem; border: 2px solid var(--line);
    border-radius: 6px; min-width: 0; background: transparent; color: inherit; }
  #slug { width: 9rem; } #destination { flex: 1 1 16rem; }
  button { font: inherit; padding: .5rem 1.2rem; border: 2px solid var(--line); border-radius: 6px;
    cursor: pointer; background: transparent; color: inherit; }
  button:hover { background: #8881; }
  #result { min-height: 1.5rem; font-weight: 600; }
  #result a { word-break: break-all; }
  .muted { color: var(--dim); font-size: .9rem; }
  footer { margin-top: 3rem; font-size: .9rem; color: var(--dim); }
`;

function layout(title, repoUrl, body) {
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
<a class="gh" href="${repoUrl}">View on GitHub</a>
${body}
</body>
</html>`;
}

function landingPage(env) {
  const repoUrl = `https://github.com/${esc(env.GITHUB_REPO)}`;
  const linkHost = esc(env.APEX_HOST || "updog.link");
  const donate = env.DONATE_URL
    ? `<p>Donations are accepted to cover nominal hosting fees, and any proceeds are forwarded directly to the
       <a href="https://girlswhocode.com/">Girls Who Code Foundation</a>.
       <a href="${esc(env.DONATE_URL)}">Sponsor this project</a> if you'd like to chip in.</p>`
    : "";

  return layout(
    "What's Updog?",
    repoUrl,
    `
<h1>What's Updog? 🐶</h1>
<p class="muted">An ad-free, open-source URL shortener that anyone can deploy and run.</p>

<h2>Create a shortlink to anywhere</h2>
<form id="create">
  <div class="row">
    <label for="slug">${linkHost}/</label>
    <input type="text" id="slug" name="slug" value="iLoveDavid" maxlength="64" pattern="[A-Za-z0-9_-]+" required>
    <span>→</span>
    <input type="url" id="destination" name="destination" value="https://github.com/${esc(env.GITHUB_REPO)}" required>
    <button type="submit">Go! 🐕</button>
  </div>
  <div class="cf-turnstile" data-sitekey="${esc(env.TURNSTILE_SITEKEY)}"></div>
  <p id="result" aria-live="polite"></p>
</form>
<p class="muted">Links can't be edited once created. To report an abusive link, open an issue
<a href="${repoUrl}/issues">on GitHub</a>.</p>

<h2>Why does this exist?</h2>
<p>Aside from being a free shortlink service with a <em><a href="https://www.urbandictionary.com/define.php?term=Sick">sick</a></em> name,
this project is ad-free and doesn't collect information to track you or anyone else.</p>
${donate}
<p>Consider cloning the repository and running your own. It's a compact intro to Infrastructure as Code and serverless cloud
technologies, and you get to have your own shortlink service.</p>

<h2>How do I run my own?</h2>
<p>Deployment takes about ten minutes, start to finish, including reading the instructions. It runs on Cloudflare's free tier,
so serving a few million redirects a month costs nothing.</p>
<p>Click the GitHub link up top if you'd like to give it a try.</p>

<h2>But no, really, what is "Updog?"</h2>
<p><a href="https://knowyourmeme.com/memes/updog">Nothin' much. What's up with you?</a></p>

<footer>Updog.link is a silly pet project, published with <a href="https://workers.cloudflare.com/">Cloudflare Workers</a>.</footer>

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

function notFoundPage(env) {
  const repoUrl = `https://github.com/${esc(env.GITHUB_REPO)}`;
  const site = env.SITE_HOST ? `https://${esc(env.SITE_HOST)}/` : "/";
  return layout(
    "404 · What's Updog?",
    repoUrl,
    `
<h1>404 🐕</h1>
<p>Nothin' much here. That shortlink doesn't exist.</p>
<p><a href="${site}">Make one instead</a></p>
`
  );
}
