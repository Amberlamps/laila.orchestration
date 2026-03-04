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
      storage_class = string # INTELLIGENT_TIERING, GLACIER, etc.
    })), [])
    expiration_days                    = optional(number)
    noncurrent_version_expiration_days = optional(number)
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
