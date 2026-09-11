# Five link creations per 10 seconds per IP. The free plan allows one rate
# limiting rule with a 10 second window.
resource "cloudflare_ruleset" "create_ratelimit" {
  zone_id = cloudflare_zone.this.id
  name    = "Shortlink creation rate limit"
  kind    = "zone"
  phase   = "http_ratelimit"

  rules = [{
    action      = "block"
    description = "Limit POST /api/links per IP"
    enabled     = true
    expression  = "(http.request.uri.path eq \"/api/links\" and http.request.method eq \"POST\")"
    ratelimit = {
      characteristics     = ["ip.src", "cf.colo.id"]
      period              = 10
      requests_per_period = 5
      mitigation_timeout  = 10
    }
  }]
}
