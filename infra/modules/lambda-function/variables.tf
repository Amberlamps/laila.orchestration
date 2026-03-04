# Input variables for the Lambda function module.

variable "function_name" {
  description = "Name of the Lambda function"
  type        = string
}

variable "description" {
  description = "Description of the Lambda function's purpose"
  type        = string
  default     = ""
}

variable "handler" {
  description = "Lambda handler entry point (e.g., 'handler.handler')"
  type        = string
  default     = "handler.handler"
}

variable "memory_size" {
  description = "Memory allocation in MB (512-1024 recommended)"
  type        = number
  default     = 512

  validation {
    condition     = var.memory_size >= 128 && var.memory_size <= 10240
    error_message = "memory_size must be between 128 and 10240 MB"
  }
}

variable "timeout" {
  description = "Function timeout in seconds"
  type        = number
  default     = 30
}

variable "deployment_package" {
  description = "Path to the Lambda deployment package (zip file)"
  type        = string
}

variable "environment_variables" {
  description = "Environment variables to set on the Lambda function"
  type        = map(string)
  default     = {}
}

variable "log_level" {
  description = "Log level for pino (debug, info, warn, error)"
  type        = string
  default     = "info"
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 90
}

variable "ssm_parameter_arns" {
  description = "ARNs of SSM parameters this function needs read access to"
  type        = list(string)
  default     = []
}

variable "additional_policies" {
  description = "Additional IAM policies to attach (map of name -> policy JSON)"
  type        = map(string)
  default     = {}
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
