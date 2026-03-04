# Required Terraform and provider versions.
# Pins to specific major versions for stability.

terraform {
  required_version = ">= 1.7.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "laila-works"
      Environment = "production"
      ManagedBy   = "terraform"
    }
  }
}

# Additional provider for us-east-1 resources (ACM certificates for CloudFront)
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"

  default_tags {
    tags = {
      Project     = "laila-works"
      Environment = "production"
      ManagedBy   = "terraform"
    }
  }
}
