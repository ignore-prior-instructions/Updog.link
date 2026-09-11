terraform {
  required_version = ">= 1.10"

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
  }

  # State lives in an R2 bucket, using R2's S3-compatible API. The
  # account-specific endpoint isn't known here, so it's supplied at init
  # time via the AWS SDK's standard endpoint override:
  #   AWS_ENDPOINT_URL_S3=https://<account_id>.r2.cloudflarestorage.com terraform init
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
