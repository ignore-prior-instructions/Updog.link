# Bot check on the create form. "invisible" renders nothing and never asks the
# visitor to click anything.
resource "cloudflare_turnstile_widget" "create_form" {
  account_id = var.account_id
  name       = "${var.domain} create form"
  domains    = distinct([var.domain, local.site_host])
  mode       = "invisible"
}
