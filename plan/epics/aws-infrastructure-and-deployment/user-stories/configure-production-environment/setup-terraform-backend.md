# Setup Terraform Backend

## Task Details

- **Title:** Setup Terraform Backend
- **Status:** Complete
- **Assigned Agent:** terraform-engineer
- **Parent User Story:** [Configure Production Environment](./tasks.md)
- **Parent Epic:** [AWS Infrastructure & Deployment](../../user-stories.md)
- **Dependencies:** None

## Description

Configure the S3 backend for Terraform state storage with DynamoDB state locking. This is the foundational infrastructure configuration that must exist before any other Terraform resources can be managed. Create `backend.tf` and `versions.tf` with required providers.

### Backend Configuration

```hcl
# infra/environments/production/backend.tf
# Terraform backend configuration for production state management.
# Uses S3 for state storage and DynamoDB for state locking to prevent
# concurrent modifications.

terraform {
  backend "s3" {
    bucket         = "laila-works-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "laila-works-terraform-locks"
  }
}
```

### Provider Configuration

```hcl
# infra/environments/production/versions.tf
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
```

### Bootstrap Script

```bash
# infra/scripts/bootstrap-backend.sh
# One-time script to create the S3 bucket and DynamoDB table
# for Terraform state management. Run this manually before
# the first `terraform init`.

#!/usr/bin/env bash
set -euo pipefail

AWS_REGION="us-east-1"
STATE_BUCKET="laila-works-terraform-state"
LOCK_TABLE="laila-works-terraform-locks"

# Create S3 bucket for state storage
aws s3api create-bucket \
  --bucket "$STATE_BUCKET" \
  --region "$AWS_REGION"

# Enable versioning for state history
aws s3api put-bucket-versioning \
  --bucket "$STATE_BUCKET" \
  --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket "$STATE_BUCKET" \
  --server-side-encryption-configuration '{
    "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]
  }'

# Block public access
aws s3api put-public-access-block \
  --bucket "$STATE_BUCKET" \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# Create DynamoDB table for state locking
aws dynamodb create-table \
  --table-name "$LOCK_TABLE" \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region "$AWS_REGION"

echo "Terraform backend resources created successfully."
echo "Run 'terraform init' in infra/environments/production/"
```

## Acceptance Criteria

- [ ] `infra/environments/production/backend.tf` configures S3 backend with encryption
- [ ] `infra/environments/production/versions.tf` pins Terraform >= 1.7 and AWS provider ~> 5.0
- [ ] Default provider is configured with the project region
- [ ] A `us-east-1` aliased provider exists for ACM certificates (required by CloudFront)
- [ ] Default tags are applied to all resources: Project, Environment, ManagedBy
- [ ] Bootstrap script exists at `infra/scripts/bootstrap-backend.sh`
- [ ] Bootstrap script creates S3 bucket with versioning, encryption, and public access block
- [ ] Bootstrap script creates DynamoDB table for state locking
- [ ] `terraform init` succeeds after running the bootstrap script
- [ ] `terraform validate` passes on the production configuration

## Technical Notes

- The bootstrap script is a one-time manual step that creates the "chicken-and-egg" resources: the S3 bucket and DynamoDB table that Terraform itself uses for state management. These resources cannot be managed by Terraform because they must exist before Terraform can initialize.
- State encryption ensures that sensitive values stored in the state file (e.g., database passwords, API keys) are encrypted at rest in S3.
- DynamoDB state locking prevents two people or CI pipelines from running `terraform apply` simultaneously, which could corrupt the state file.
- The dual provider setup (default region + us-east-1) is necessary because ACM certificates for CloudFront must be created in us-east-1, regardless of where other resources are deployed.

## References

- **Terraform Documentation:** https://developer.hashicorp.com/terraform/language/settings/backends/s3
- **AWS Documentation:** S3 bucket creation, DynamoDB table creation

## Estimated Complexity

Low — Standard Terraform backend setup. The main task is the bootstrap script and dual provider configuration.
