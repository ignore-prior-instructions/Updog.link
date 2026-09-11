variable "account_id" {
  description = "Cloudflare account id (Dashboard → any zone → Overview → API section)."
  type        = string
}

variable "domain" {
  description = "Apex domain the shortener serves, e.g. updog.link. Its nameservers must point at Cloudflare."
  type        = string
}

variable "github_repo" {
  description = "GitHub repository in owner/name form, linked from the landing page."
  type        = string
  default     = "ignore-prior-instructions/Updog.link"
}

variable "donate_url" {
  description = "Optional donation link (e.g. GitHub Sponsors). Empty hides the Donate link."
  type        = string
  default     = "https://github.com/sponsors/ignore-prior-instructions"
}

variable "site_subdomain" {
  description = <<-EOT
    Optional subdomain for the landing page, e.g. "whats" for whats.<domain>.
    Leave empty (the default) to serve the landing page and shortlinks from
    the same apex domain; only set this if you want them split, the way
    updog.link itself does.
  EOT
  type        = string
  default     = ""
}

variable "r2_location" {
  description = "R2 bucket location hint: apac, eeur, enam, weur, wnam, or oc."
  type        = string
  default     = "wnam"
}

variable "worker_name" {
  type    = string
  default = "updog-link"
}

variable "bucket_name" {
  type    = string
  default = "updog-links"
}
