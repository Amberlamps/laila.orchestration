# infra/environments/production/main.tf
# Provider configuration for the production environment.

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = local.tags
  }
}

# Additional provider for us-east-1 resources (ACM certificates for CloudFront)
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = local.tags
  }
}
