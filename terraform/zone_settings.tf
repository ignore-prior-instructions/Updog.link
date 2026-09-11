# Shortlinks should never be served over plain HTTP.
resource "cloudflare_zone_setting" "always_use_https" {
  zone_id    = cloudflare_zone.this.id
  setting_id = "always_use_https"
  value      = "on"
}
