# CloudFront distribution using the CloudFront module.
# Integrates with Route 53 domain and ACM certificate.

module "cloudfront" {
  source = "../../modules/cloudfront-distribution"

  distribution_name   = "laila-works"
  description         = "laila.works production CDN"
  custom_domains      = [var.domain_name]
  acm_certificate_arn = aws_acm_certificate_validation.main.certificate_arn

  s3_origin = {
    bucket_regional_domain_name = module.static_assets_bucket.bucket_regional_domain_name
  }

  lambda_origin = {
    function_url_domain = trimsuffix(trimprefix(aws_lambda_function_url.nextjs.function_url, "https://"), "/")
  }

  # Managed cache policies
  default_cache_policy_id          = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # CachingDisabled
  default_origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac" # AllViewerExceptHostHeader

  # Static assets: long-lived immutable cache
  static_cache_behaviors = [
    {
      path_pattern    = "_next/static/*"
      cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6" # CachingOptimized
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
  authorization_type = "NONE" # CloudFront handles auth
}
