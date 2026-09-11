# The landing page lives on its own subdomain only if var.site_subdomain is
# set. Otherwise it shares the apex with shortlinks (see worker.js), which is
# the simpler default for a fresh deploy.
locals {
  site_host = var.site_subdomain != "" ? "${var.site_subdomain}.${var.domain}" : var.domain
}

resource "cloudflare_workers_custom_domain" "site" {
  count = var.site_subdomain != "" ? 1 : 0

  account_id = var.account_id
  hostname   = local.site_host
  service    = cloudflare_workers_script.this.script_name
  zone_id    = cloudflare_zone.this.id
  zone_name  = cloudflare_zone.this.name
}
