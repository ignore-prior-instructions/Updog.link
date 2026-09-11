resource "cloudflare_zone" "this" {
  account = { id = var.account_id }
  name    = var.domain
  type    = "full"
}
