# S3 bucket for static assets served via CloudFront.

module "static_assets_bucket" {
  source = "../../modules/s3-bucket"

  # S3 bucket names are globally unique across all AWS accounts/regions.
  # Include region to support region migrations without name collisions.
  bucket_name = "laila-works-static-assets-${var.aws_region}"

  # Static assets are immutable (hashed filenames), no need for versioning
  versioning_enabled = false

  tags = local.tags
}

# Allow CloudFront OAC to read from the static assets bucket
resource "aws_s3_bucket_policy" "static_assets_cloudfront" {
  bucket = module.static_assets_bucket.bucket_id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudFrontOAC"
        Effect    = "Allow"
        Principal = { Service = "cloudfront.amazonaws.com" }
        Action    = "s3:GetObject"
        Resource  = "${module.static_assets_bucket.bucket_arn}/*"
        Condition = {
          StringEquals = {
            "AWS:SourceArn" = module.cloudfront.distribution_arn
          }
        }
      }
    ]
  })
}
