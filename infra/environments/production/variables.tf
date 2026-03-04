# infra/environments/production/variables.tf
# Input variables for the production environment.

variable "aws_region" {
  description = "AWS region for all resources"
  type        = string
  default     = "us-east-1"
}

variable "alarm_email" {
  description = "Email address for CloudWatch alarm notifications (requires manual confirmation)"
  type        = string
}

# ---------------------------------------------------------------------------
# Lambda execution role names (for IAM policy attachments)
# ---------------------------------------------------------------------------

variable "timeout_checker_role_name" {
  description = "IAM role name for the timeout-checker Lambda function"
  type        = string
  default     = "laila-works-timeout-checker-role"
}

variable "dag_reconciler_role_name" {
  description = "IAM role name for the dag-reconciler Lambda function"
  type        = string
  default     = "laila-works-dag-reconciler-role"
}

variable "audit_archiver_role_name" {
  description = "IAM role name for the audit-archiver Lambda function"
  type        = string
  default     = "laila-works-audit-archiver-role"
}

variable "nextjs_api_role_name" {
  description = "IAM role name for the Next.js API Lambda function"
  type        = string
  default     = "laila-works-nextjs-role"
}
