terraform {
  required_version = ">= 1.10"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }

  # State lives in an R2 bucket, using R2's S3-compatible API.
  # The account-specific endpoint is supplied at init time:
  #   terraform init -backend-config=backend.hcl
  # (copy backend.hcl.example to backend.hcl and fill in your account id)
  backend "s3" {
    bucket                      = "updog-tfstate"
    key                         = "updog.link.tfstate"
    region                      = "auto"
    skip_credentials_validation = true
    skip_region_validation      = true
    skip_requesting_account_id  = true
    skip_s3_checksum            = true
    use_path_style              = true
    use_lockfile                = true
  }
}

# Authenticates with the CLOUDFLARE_API_TOKEN environment variable.
provider "cloudflare" {}
