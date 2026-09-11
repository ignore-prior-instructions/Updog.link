# The landing page lives on this subdomain, as it always has. The apex is
# reserved for shortlinks and 301s here at the root (see worker.js).
locals {
  site_host = "${var.site_subdomain}.${var.domain}"
}

resource "cloudflare_workers_custom_domain" "site" {
  account_id = var.account_id
  hostname   = local.site_host
  service    = cloudflare_workers_script.this.script_name
  zone_id    = cloudflare_zone.this.id
  zone_name  = cloudflare_zone.this.name
}
