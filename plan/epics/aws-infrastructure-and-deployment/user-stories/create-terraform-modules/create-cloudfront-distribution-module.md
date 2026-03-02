# Create CloudFront Distribution Module

## Task Details

- **Title:** Create CloudFront Distribution Module
- **Status:** Not Started
- **Assigned Agent:** terraform-engineer
- **Parent User Story:** [Create Terraform Modules](./tasks.md)
- **Parent Epic:** [AWS Infrastructure & Deployment](../../user-stories.md)
- **Dependencies:** None

## Description

Create a reusable Terraform module for CloudFront distributions at `infra/modules/cloudfront-distribution/`. This module supports S3 origins for static assets, Lambda Function URL origins for the API/SSR layer, custom domain with ACM certificate, gzip and Brotli compression, and configurable cache behaviors.

### Module Structure

```hcl
# infra/modules/cloudfront-distribution/main.tf
# Reusable Terraform module for CloudFront distributions.
# Supports S3 + Lambda origins for Next.js deployment via OpenNext.

resource "aws_cloudfront_distribution" "this" {
  enabled             = true
  is_ipv6_enabled     = true
  comment             = var.description
  default_root_object = var.default_root_object
  price_class         = var.price_class
  aliases             = var.custom_domains
  web_acl_id          = var.web_acl_id

  # S3 origin for static assets (_next/static, public/)
  origin {
    domain_name              = var.s3_origin.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.s3.id
    origin_id                = "s3-static"
  }

  # Lambda Function URL origin for SSR/API routes
  dynamic "origin" {
    for_each = var.lambda_origin != null ? [var.lambda_origin] : []
    content {
      domain_name = origin.value.function_url_domain
      origin_id   = "lambda-ssr"

      custom_origin_config {
        http_port              = 80
        https_port             = 443
        origin_protocol_policy = "https-only"
        origin_ssl_protocols   = ["TLSv1.2"]
      }
    }
  }

  # Default cache behavior — routes to Lambda SSR origin
  default_cache_behavior {
    allowed_methods  = ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"]
    cached_methods   = ["GET", "HEAD"]
    target_origin_id = var.lambda_origin != null ? "lambda-ssr" : "s3-static"

    # Use managed CachingDisabled policy for SSR (dynamic content)
    cache_policy_id          = var.default_cache_policy_id
    origin_request_policy_id = var.default_origin_request_policy_id

    viewer_protocol_policy = "redirect-to-https"
    compress               = true  # Enable gzip + Brotli compression
  }

  # Static assets cache behavior — long-lived immutable cache
  dynamic "ordered_cache_behavior" {
    for_each = var.static_cache_behaviors
    content {
      path_pattern     = ordered_cache_behavior.value.path_pattern
      allowed_methods  = ["GET", "HEAD", "OPTIONS"]
      cached_methods   = ["GET", "HEAD"]
      target_origin_id = "s3-static"

      cache_policy_id = ordered_cache_behavior.value.cache_policy_id

      viewer_protocol_policy = "redirect-to-https"
      compress               = true
    }
  }

  # Custom error responses (e.g., SPA fallback)
  dynamic "custom_error_response" {
    for_each = var.custom_error_responses
    content {
      error_code            = custom_error_response.value.error_code
      response_code         = custom_error_response.value.response_code
      response_page_path    = custom_error_response.value.response_page_path
      error_caching_min_ttl = custom_error_response.value.error_caching_min_ttl
    }
  }

  # ACM certificate for custom domain (must be in us-east-1)
  dynamic "viewer_certificate" {
    for_each = var.acm_certificate_arn != null ? [1] : []
    content {
      acm_certificate_arn      = var.acm_certificate_arn
      ssl_support_method       = "sni-only"
      minimum_protocol_version = "TLSv1.2_2021"
    }
  }

  # Default CloudFront certificate (when no custom domain)
  dynamic "viewer_certificate" {
    for_each = var.acm_certificate_arn == null ? [1] : []
    content {
      cloudfront_default_certificate = true
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  tags = var.tags
}

# Origin Access Control for S3 (replaces legacy OAI)
resource "aws_cloudfront_origin_access_control" "s3" {
  name                              = "${var.distribution_name}-s3-oac"
  description                       = "OAC for S3 static assets"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}
```

### Variables

```hcl
# infra/modules/cloudfront-distribution/variables.tf

variable "distribution_name" {
  description = "Logical name for the distribution (used in resource naming)"
  type        = string
}

variable "description" {
  description = "Description for the CloudFront distribution"
  type        = string
  default     = ""
}

variable "custom_domains" {
  description = "Custom domain names (CNAMEs)"
  type        = list(string)
  default     = []
}

variable "acm_certificate_arn" {
  description = "ARN of the ACM certificate (must be in us-east-1)"
  type        = string
  default     = null
}

variable "s3_origin" {
  description = "S3 bucket origin configuration for static assets"
  type = object({
    bucket_regional_domain_name = string
  })
}

variable "lambda_origin" {
  description = "Lambda Function URL origin for SSR/API (optional)"
  type = object({
    function_url_domain = string
  })
  default = null
}

variable "default_cache_policy_id" {
  description = "CloudFront cache policy ID for the default behavior"
  type        = string
}

variable "default_origin_request_policy_id" {
  description = "CloudFront origin request policy ID for the default behavior"
  type        = string
}

variable "static_cache_behaviors" {
  description = "Ordered cache behaviors for static assets"
  type = list(object({
    path_pattern    = string
    cache_policy_id = string
  }))
  default = []
}

variable "custom_error_responses" {
  description = "Custom error response configurations"
  type = list(object({
    error_code            = number
    response_code         = number
    response_page_path    = string
    error_caching_min_ttl = number
  }))
  default = []
}

variable "default_root_object" {
  description = "Default root object (e.g., index.html)"
  type        = string
  default     = ""
}

variable "price_class" {
  description = "CloudFront price class"
  type        = string
  default     = "PriceClass_100"  # US, Canada, Europe
}

variable "web_acl_id" {
  description = "WAF Web ACL ID (optional)"
  type        = string
  default     = null
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
```

### Outputs

```hcl
# infra/modules/cloudfront-distribution/outputs.tf

output "distribution_id" {
  description = "CloudFront distribution ID"
  value       = aws_cloudfront_distribution.this.id
}

output "distribution_domain_name" {
  description = "CloudFront distribution domain name"
  value       = aws_cloudfront_distribution.this.domain_name
}

output "distribution_arn" {
  description = "CloudFront distribution ARN"
  value       = aws_cloudfront_distribution.this.arn
}

output "oac_id" {
  description = "Origin Access Control ID for S3 bucket policy"
  value       = aws_cloudfront_origin_access_control.s3.id
}
```

## Acceptance Criteria

- [ ] Module exists at `infra/modules/cloudfront-distribution/`
- [ ] S3 origin is configured for static assets with Origin Access Control (OAC)
- [ ] Lambda Function URL origin is optionally configured for SSR/API
- [ ] Custom domain support via `aliases` and ACM certificate
- [ ] Viewer protocol policy enforces HTTPS redirect
- [ ] Compression is enabled (gzip + Brotli)
- [ ] Static asset cache behaviors are configurable for long-lived immutable caching
- [ ] Custom error responses are configurable
- [ ] TLS minimum version is 1.2
- [ ] Price class is configurable (default: US, Canada, Europe)
- [ ] All resources are tagged
- [ ] Module outputs include distribution ID, domain name, ARN, and OAC ID
- [ ] `terraform validate` passes

## Technical Notes

- The ACM certificate must be in `us-east-1` regardless of the region where other resources are deployed. This is a CloudFront requirement.
- Origin Access Control (OAC) replaces the legacy Origin Access Identity (OAI) and provides better security with SigV4 signing.
- For OpenNext v3 deployment, the Lambda Function URL serves as the origin for SSR pages and API routes. Static assets are served directly from S3.
- The `PriceClass_100` default limits edge locations to US, Canada, and Europe for cost optimization. Adjust to `PriceClass_All` for global distribution.

## References

- **Terraform Provider:** AWS (hashicorp/aws) >= 5.0
- **OpenNext v3:** CloudFront + Lambda + S3 architecture for Next.js
- **AWS Documentation:** https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/

## Estimated Complexity

High — CloudFront has many configuration options and the interaction between multiple origins, cache behaviors, and certificate management requires careful configuration.
