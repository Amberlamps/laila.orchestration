# Configure Domain and SSL

## Task Details

- **Title:** Configure Domain and SSL
- **Status:** Not Started
- **Assigned Agent:** terraform-engineer
- **Parent User Story:** [Configure Production Environment](./tasks.md)
- **Parent Epic:** [AWS Infrastructure & Deployment](../../user-stories.md)
- **Dependencies:** Setup Terraform Backend

## Description

Configure Route 53 hosted zone for the laila.works domain, create an ACM certificate with DNS validation (auto-renewed by AWS), and wire it into the CloudFront distribution for HTTPS on the custom domain.

### Route 53 and ACM Configuration

```hcl
# infra/environments/production/dns.tf
# Route 53 and ACM configuration for the laila.works custom domain.
# ACM certificate must be in us-east-1 for CloudFront.

# Route 53 hosted zone for the domain
resource "aws_route53_zone" "main" {
  name    = var.domain_name
  comment = "Hosted zone for laila.works"

  tags = local.tags
}

# ACM certificate in us-east-1 (required for CloudFront)
resource "aws_acm_certificate" "main" {
  provider = aws.us_east_1

  domain_name               = var.domain_name
  subject_alternative_names = ["*.${var.domain_name}"]
  validation_method         = "DNS"

  lifecycle {
    create_before_destroy = true
  }

  tags = local.tags
}

# DNS validation records for the ACM certificate
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.main.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  name            = each.value.name
  records         = [each.value.record]
  ttl             = 60
  type            = each.value.type
  zone_id         = aws_route53_zone.main.zone_id
}

# Wait for certificate validation to complete
resource "aws_acm_certificate_validation" "main" {
  provider = aws.us_east_1

  certificate_arn         = aws_acm_certificate.main.arn
  validation_record_fqdns = [for record in aws_route53_record.cert_validation : record.fqdn]
}

# A record (alias) pointing the domain to CloudFront
resource "aws_route53_record" "cloudfront_alias" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "A"

  alias {
    name                   = module.cloudfront.distribution_domain_name
    zone_id                = "Z2FDTNDATAQYW2"  # CloudFront hosted zone ID (constant)
    evaluate_target_health = false
  }
}

# AAAA record for IPv6
resource "aws_route53_record" "cloudfront_alias_ipv6" {
  zone_id = aws_route53_zone.main.zone_id
  name    = var.domain_name
  type    = "AAAA"

  alias {
    name                   = module.cloudfront.distribution_domain_name
    zone_id                = "Z2FDTNDATAQYW2"
    evaluate_target_health = false
  }
}
```

### CloudFront Integration

```hcl
# infra/environments/production/cdn.tf
# CloudFront distribution using the CloudFront module.
# Integrates with Route 53 domain and ACM certificate.

module "cloudfront" {
  source = "../../modules/cloudfront-distribution"

  distribution_name = "laila-works"
  description       = "laila.works production CDN"
  custom_domains    = [var.domain_name]
  acm_certificate_arn = aws_acm_certificate_validation.main.certificate_arn

  s3_origin = {
    bucket_regional_domain_name = module.static_assets_bucket.bucket_regional_domain_name
  }

  lambda_origin = {
    function_url_domain = replace(
      aws_lambda_function_url.nextjs.function_url,
      "/^https?://([^/]+).*/", "$1"
    )
  }

  # Managed cache policies
  default_cache_policy_id          = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"  # CachingDisabled
  default_origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"  # AllViewerExceptHostHeader

  # Static assets: long-lived immutable cache
  static_cache_behaviors = [
    {
      path_pattern    = "_next/static/*"
      cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"  # CachingOptimized
    },
    {
      path_pattern    = "static/*"
      cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    },
  ]

  tags = local.tags
}

# Lambda Function URL for the Next.js Lambda (used as CloudFront origin)
resource "aws_lambda_function_url" "nextjs" {
  function_name      = module.nextjs_lambda.function_name
  authorization_type = "NONE"  # CloudFront handles auth
}
```

## Acceptance Criteria

- [ ] Route 53 hosted zone is created for the domain
- [ ] ACM certificate is created in us-east-1 with DNS validation
- [ ] Wildcard SAN (`*.domain`) is included in the certificate
- [ ] DNS validation records are created in Route 53 automatically
- [ ] Certificate validation resource waits for validation to complete
- [ ] A record (alias) points the domain to CloudFront
- [ ] AAAA record (alias) provides IPv6 support
- [ ] CloudFront distribution uses the validated ACM certificate
- [ ] CloudFront is configured with S3 origin for static assets and Lambda origin for SSR
- [ ] Static asset cache behaviors use CachingOptimized policy for long-lived caching
- [ ] Default behavior uses CachingDisabled for dynamic SSR content
- [ ] Lambda Function URL is created for the Next.js Lambda
- [ ] All resources are tagged
- [ ] `terraform validate` passes

## Technical Notes

- **ACM certificate in us-east-1:** CloudFront requires its ACM certificate to be in us-east-1. The `aws.us_east_1` provider alias handles this. The certificate is created in us-east-1 while other resources may be in a different region.
- **DNS validation vs. email validation:** DNS validation is preferred because it supports automatic renewal. AWS will renew the certificate before expiration as long as the validation CNAME records exist in Route 53.
- **CloudFront hosted zone ID:** `Z2FDTNDATAQYW2` is the fixed hosted zone ID for all CloudFront distributions. It is used in Route 53 alias records.
- **Lambda Function URL:** OpenNext v3 uses Lambda Function URLs as the CloudFront origin for SSR pages and API routes. The `authorization_type = "NONE"` is safe because CloudFront is the only client hitting this URL (the URL is not publicly advertised).
- **Cache policies:** AWS provides managed cache policies. `CachingDisabled` ensures SSR responses are never cached. `CachingOptimized` provides long-lived caching for immutable static assets (hashed filenames in `_next/static/`).

## References

- **Terraform Provider:** AWS (hashicorp/aws) >= 5.0
- **Route 53:** https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/
- **ACM:** https://docs.aws.amazon.com/acm/latest/userguide/
- **CloudFront Module:** [Create CloudFront Distribution Module](../create-terraform-modules/create-cloudfront-distribution-module.md)
- **OpenNext:** Next.js to Lambda + CloudFront deployment

## Estimated Complexity

Medium — Multiple interrelated resources (Route 53 zone, ACM certificate, validation records, CloudFront aliases). The us-east-1 provider requirement and managed cache policy IDs add configuration complexity.
