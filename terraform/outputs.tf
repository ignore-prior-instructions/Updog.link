output "name_servers" {
  description = "Set these as the domain's nameservers at your registrar."
  value       = cloudflare_zone.this.name_servers
}

output "turnstile_sitekey" {
  value = cloudflare_turnstile_widget.create_form.sitekey
}

output "url" {
  value = "https://${var.domain}"
}
