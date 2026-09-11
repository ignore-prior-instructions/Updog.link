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
  description = "Optional donation link (e.g. GitHub Sponsors). Empty hides the donation line."
  type        = string
  default     = "https://github.com/sponsors/ignore-prior-instructions"
}

variable "site_subdomain" {
  description = "Subdomain that serves the landing page. The apex serves shortlinks."
  type        = string
  default     = "whats"
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
