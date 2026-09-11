resource "cloudflare_workers_script" "this" {
  account_id         = var.account_id
  script_name        = var.worker_name
  content_file       = "${path.module}/../worker.js"
  content_sha256     = filesha256("${path.module}/../worker.js")
  main_module        = "worker.js"
  compatibility_date = "2025-09-01"

  bindings = [
    {
      name        = "LINKS"
      type        = "r2_bucket"
      bucket_name = cloudflare_r2_bucket.links.name
    },
    {
      name = "TURNSTILE_SECRET"
      type = "secret_text"
      text = cloudflare_turnstile_widget.create_form.secret
    },
    {
      name = "TURNSTILE_SITEKEY"
      type = "plain_text"
      text = cloudflare_turnstile_widget.create_form.sitekey
    },
    {
      name = "GITHUB_REPO"
      type = "plain_text"
      text = var.github_repo
    },
    {
      name = "DONATE_URL"
      type = "plain_text"
      text = var.donate_url
    },
    {
      name = "APEX_HOST"
      type = "plain_text"
      text = var.domain
    },
    {
      name = "SITE_HOST"
      type = "plain_text"
      text = local.site_host
    },
  ]
}

# Routes https://<domain>/* to the Worker. Requires the zone to be active
# (nameservers pointed at Cloudflare); re-run apply after switching them.
resource "cloudflare_workers_custom_domain" "this" {
  account_id = var.account_id
  hostname   = var.domain
  service    = cloudflare_workers_script.this.script_name
  zone_id    = cloudflare_zone.this.id
  zone_name  = cloudflare_zone.this.name
}
