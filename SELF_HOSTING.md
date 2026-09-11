# How it works

The whole thing is one Cloudflare Worker and one R2 bucket, deployed with Terraform.

- `worker.js` serves the landing page, the create endpoint, redirects, and the 404 page. That's the entire application.
- By default, the landing page and shortlinks share the apex domain: `updog.link/` is the page, `updog.link/<slug>`
  redirects. Set `site_subdomain` in `terraform.tfvars` if you'd rather split them, e.g. `whats.<domain>` for the page
  and the apex only for shortlinks — that's how updog.link itself is set up. Split mode 301s the apex root to the
  site subdomain and vice versa for any shortlink reached from it.
- The R2 bucket holds one small JSON object per link, keyed by slug. Creating a link is a conditional put that fails
  if the slug exists, so it's first come, first served, and a new link is live the instant it's created.
- Cloudflare Turnstile guards the create form against bots, running invisibly so nothing is rendered. A rate
  limiting rule blocks a given IP after 5 creation attempts in 10 seconds.
- Redirects are 302s, so a bad link can be removed and stop working immediately.
- `terraform/` describes all of it: the DNS zone, the bucket, the Turnstile widget, the Worker and its bindings,
  the custom domain, and the rate limit. Terraform state lives in a second R2 bucket.

Everything fits in Cloudflare's free tier. The ceilings that matter are 100,000 Worker requests per day and one
million R2 writes per month. The domain is the only recurring cost.

## Run your own

About ten minutes, start to finish, including reading this.

**You need:** a domain, a Cloudflare account, [Terraform](https://developer.hashicorp.com/terraform/install) 1.10 or
newer, and Node (for local development only).

1. **Add your domain to Cloudflare** (free plan) and note the two nameservers it assigns and your account id. Terraform
   can create the zone, but doing this first in the dashboard lets you switch nameservers at your registrar right away.
2. **Enable R2** on the account (Cloudflare asks for a payment method; free-tier usage is $0). Create a bucket called
   `updog-tfstate` for Terraform state. You also need S3-style credentials for it: either create a token under
   R2 → *Manage API tokens*, or derive them from the token you make in the next step, since any token carrying
   R2 permissions works. The access key id is the token's id, and the secret is the SHA-256 of the token string:

   ```sh
   printf '%s' "$CLOUDFLARE_API_TOKEN" | shasum -a 256
   ```
3. **Create a Cloudflare API token** (My Profile → API Tokens → Create Token → Create Custom Token). Use a *user*
   token, not an account-owned one; account-owned tokens don't support Turnstile. Permissions:
   - Account: Workers Scripts (Edit), Workers R2 Storage (Edit), Turnstile (Edit), Account Settings (Read)
   - Zone: Zone (Edit), DNS (Edit), Zone WAF (Edit), Zone Settings (Edit), Workers Routes (Edit)
4. **Configure and apply:**

   ```sh
   git clone https://github.com/ignore-prior-instructions/Updog.link && cd Updog.link/terraform
   cp backend.hcl.example backend.hcl        # put your account id in the endpoint
   cp terraform.tfvars.example terraform.tfvars   # account id, domain, repo, donate link

   export CLOUDFLARE_API_TOKEN=...            # from step 3
   export AWS_ACCESS_KEY_ID=...               # from step 2 (R2 token)
   export AWS_SECRET_ACCESS_KEY=...

   terraform init -backend-config=backend.hcl
   terraform apply
   ```

5. **Point your domain at Cloudflare.** At your registrar — not in your old DNS provider's zone — set the nameservers
   to the ones from step 1 (also shown in the `name_servers` output). Check the change took with
   `whois <domain> | grep -i 'name server'`. If the apex already has A or CNAME records in Cloudflare (the zone scan
   imports them), delete them first: a Worker custom domain can't share a hostname with them. Then run
   `terraform apply` again once Cloudflare shows the zone as active. Terraform manages the apex as a custom domain,
   plus a second one for `site_subdomain` if you set it, and Cloudflare creates the DNS records automatically.
6. **Make it yours.** Edit `.github/FUNDING.yml` to your own GitHub username, or delete the file to drop the Sponsors
   button. `github_repo` and `donate_url` in `terraform.tfvars` control what the landing page links to.
7. **Seed the examples** so a brand-new deploy isn't an empty shortener:

   ```sh
   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... node scripts/seed.mjs
   ```

   This creates the links in `SAMPLES` at the top of `worker.js` — the same list the landing page draws its rotating
   placeholder from, so every suggestion the form makes is a link that actually resolves. Existing slugs are never
   overwritten, so it's safe to re-run.

Open `https://your.domain` (or `https://whats.your.domain` if you set `site_subdomain`) and make a link.

## Local development

```sh
npx wrangler dev
```

`wrangler.jsonc` is for local development only. It uses an in-memory R2 bucket and Cloudflare's public Turnstile test
keys, so the bot check always passes. Production is deployed with Terraform, not `wrangler deploy`.

Quick checks against the dev server:

```sh
curl -s -X POST localhost:8787/api/links -H 'content-type: application/json' \
  -d '{"slug":"github","destination":"https://github.com","token":"x"}'
curl -si localhost:8787/github | grep -i location
```

## Operating it

**Removing a link** is deleting its object from the bucket, in the dashboard or with wrangler:

```sh
npx wrangler r2 object delete updog-links/<slug> --remote
```

**Changing the page or logic** is editing `worker.js` and running `terraform apply`. Terraform tracks the file's hash
and redeploys when it changes.

**Rate limit and Turnstile** settings are in `terraform/ratelimit.tf` and `terraform/turnstile.tf`. The widget runs in
invisible mode, so nothing is rendered and no visitor is asked to click anything.

**Donations** are wired to GitHub Sponsors via `.github/FUNDING.yml` and the `donate_url` variable. Set that variable
to an empty string to hide the donation line entirely.
