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

variable "lambda_origin_access_control_id" {
  description = "OAC ID for Lambda Function URL origin (optional, enables IAM auth instead of public URL)"
  type        = string
  default     = null
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
  default     = "PriceClass_100" # US, Canada, Europe
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
