# One object per shortlink, keyed by slug. This is the entire database.
resource "cloudflare_r2_bucket" "links" {
  account_id = var.account_id
  name       = var.bucket_name
  location   = var.r2_location
}
