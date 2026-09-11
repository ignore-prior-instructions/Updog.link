# Bot check on the create form. "managed" is invisible for most visitors and
# only shows a checkbox to suspicious traffic.
resource "cloudflare_turnstile_widget" "create_form" {
  account_id = var.account_id
  name       = "${var.domain} create form"
  domains    = [var.domain]
  mode       = "managed"
}
