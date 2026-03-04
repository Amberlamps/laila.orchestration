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
    compress               = true # Enable gzip + Brotli compression
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
