# Create S3 Bucket Module

## Task Details

- **Title:** Create S3 Bucket Module
- **Status:** Not Started
- **Assigned Agent:** terraform-engineer
- **Parent User Story:** [Create Terraform Modules](./tasks.md)
- **Parent Epic:** [AWS Infrastructure & Deployment](../../user-stories.md)
- **Dependencies:** None

## Description

Create a reusable Terraform module for S3 buckets at `infra/modules/s3-bucket/`. This module configures versioning, server-side encryption (SSE-S3), lifecycle policies with Intelligent-Tiering for archive buckets, CORS configuration, and public access blocking.

### Module Structure

```hcl
# infra/modules/s3-bucket/main.tf
# Reusable Terraform module for S3 buckets.
# Configures: versioning, encryption, lifecycle, CORS, public access block.

resource "aws_s3_bucket" "this" {
  bucket        = var.bucket_name
  force_destroy = var.force_destroy

  tags = var.tags
}

# Block all public access by default
resource "aws_s3_bucket_public_access_block" "this" {
  bucket = aws_s3_bucket.this.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Versioning for data protection and rollback
resource "aws_s3_bucket_versioning" "this" {
  bucket = aws_s3_bucket.this.id

  versioning_configuration {
    status = var.versioning_enabled ? "Enabled" : "Suspended"
  }
}

# Server-side encryption with S3-managed keys (SSE-S3)
resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  bucket = aws_s3_bucket.this.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# Lifecycle rules for cost optimization
dynamic "lifecycle_rule" {
  for_each = var.lifecycle_rules
  content {
    # Lifecycle rules configured via variable
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "this" {
  count  = length(var.lifecycle_rules) > 0 ? 1 : 0
  bucket = aws_s3_bucket.this.id

  dynamic "rule" {
    for_each = var.lifecycle_rules
    content {
      id     = rule.value.id
      status = "Enabled"

      filter {
        prefix = lookup(rule.value, "prefix", "")
      }

      dynamic "transition" {
        for_each = lookup(rule.value, "transitions", [])
        content {
          days          = transition.value.days
          storage_class = transition.value.storage_class
        }
      }

      dynamic "expiration" {
        for_each = lookup(rule.value, "expiration_days", null) != null ? [1] : []
        content {
          days = rule.value.expiration_days
        }
      }

      dynamic "noncurrent_version_expiration" {
        for_each = lookup(rule.value, "noncurrent_version_expiration_days", null) != null ? [1] : []
        content {
          noncurrent_days = rule.value.noncurrent_version_expiration_days
        }
      }
    }
  }
}

# CORS configuration (optional, for browser-based uploads)
resource "aws_s3_bucket_cors_configuration" "this" {
  count  = length(var.cors_rules) > 0 ? 1 : 0
  bucket = aws_s3_bucket.this.id

  dynamic "cors_rule" {
    for_each = var.cors_rules
    content {
      allowed_headers = cors_rule.value.allowed_headers
      allowed_methods = cors_rule.value.allowed_methods
      allowed_origins = cors_rule.value.allowed_origins
      expose_headers  = lookup(cors_rule.value, "expose_headers", [])
      max_age_seconds = lookup(cors_rule.value, "max_age_seconds", 3600)
    }
  }
}

# Bucket policy (optional, e.g., for CloudFront OAC access)
resource "aws_s3_bucket_policy" "this" {
  count  = var.bucket_policy != null ? 1 : 0
  bucket = aws_s3_bucket.this.id
  policy = var.bucket_policy
}
```

### Variables

```hcl
# infra/modules/s3-bucket/variables.tf

variable "bucket_name" {
  description = "Globally unique name for the S3 bucket"
  type        = string
}

variable "versioning_enabled" {
  description = "Enable versioning on the bucket"
  type        = bool
  default     = true
}

variable "force_destroy" {
  description = "Allow Terraform to destroy non-empty buckets"
  type        = bool
  default     = false
}

variable "lifecycle_rules" {
  description = "Lifecycle rules for cost optimization"
  type = list(object({
    id     = string
    prefix = optional(string, "")
    transitions = optional(list(object({
      days          = number
      storage_class = string  # INTELLIGENT_TIERING, GLACIER, etc.
    })), [])
    expiration_days                       = optional(number)
    noncurrent_version_expiration_days    = optional(number)
  }))
  default = []
}

variable "cors_rules" {
  description = "CORS configuration rules"
  type = list(object({
    allowed_headers = list(string)
    allowed_methods = list(string)
    allowed_origins = list(string)
    expose_headers  = optional(list(string), [])
    max_age_seconds = optional(number, 3600)
  }))
  default = []
}

variable "bucket_policy" {
  description = "Bucket policy JSON (optional)"
  type        = string
  default     = null
}

variable "tags" {
  description = "Tags to apply to the bucket"
  type        = map(string)
  default     = {}
}
```

### Outputs

```hcl
# infra/modules/s3-bucket/outputs.tf

output "bucket_arn" {
  description = "ARN of the S3 bucket"
  value       = aws_s3_bucket.this.arn
}

output "bucket_name" {
  description = "Name of the S3 bucket"
  value       = aws_s3_bucket.this.bucket
}

output "bucket_id" {
  description = "ID of the S3 bucket"
  value       = aws_s3_bucket.this.id
}

output "bucket_regional_domain_name" {
  description = "Regional domain name for CloudFront origin"
  value       = aws_s3_bucket.this.bucket_regional_domain_name
}
```

## Acceptance Criteria

- [ ] Module exists at `infra/modules/s3-bucket/` with standard Terraform files
- [ ] Public access is blocked by default (all four block settings)
- [ ] Versioning is configurable and enabled by default
- [ ] Server-side encryption uses SSE-S3 (AES256) with bucket key enabled
- [ ] Lifecycle rules are configurable with transitions and expiration
- [ ] Intelligent-Tiering storage class is supported for archive buckets
- [ ] CORS rules are optional and configurable
- [ ] Bucket policy is optional for CloudFront OAC integration
- [ ] All resources are tagged
- [ ] Module outputs include bucket ARN, name, ID, and regional domain name
- [ ] `terraform validate` passes

## Technical Notes

- Two S3 buckets will be created from this module in production:
  1. **Static assets bucket**: CloudFront origin for `_next/static/` and `public/` files. Versioning enabled for rollback.
  2. **Audit archive bucket**: Long-term storage for archived audit events. Uses Intelligent-Tiering lifecycle to automatically move infrequently accessed data to cheaper storage.
- The `bucket_regional_domain_name` output is used by the CloudFront module to configure the S3 origin.
- `force_destroy = false` by default prevents accidental deletion of buckets with data. Set to `true` only for development/testing environments.

## References

- **Terraform Provider:** AWS (hashicorp/aws) >= 5.0
- **AWS Documentation:** https://docs.aws.amazon.com/AmazonS3/latest/userguide/

## Estimated Complexity

Low — Standard S3 bucket configuration with dynamic blocks for optional features.
