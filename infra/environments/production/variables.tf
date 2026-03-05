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
  default     = "alexander.behrens.84@gmail.com"
}

# ---------------------------------------------------------------------------
# Domain configuration
# ---------------------------------------------------------------------------

variable "domain_name" {
  description = "Custom domain name for the production application (e.g. app.laila.works)"
  type        = string
  default     = "app.laila.works"
}

variable "google_client_id" {
  description = "Google OAuth Client ID (public value, embedded in OAuth redirect URLs)"
  type        = string
  default     = "208919207990-5v1m1ns96b2maskq2mruqodbs7fbmobi.apps.googleusercontent.com"
}

variable "hosted_zone_name" {
  description = "Route 53 hosted zone name (parent domain)"
  type        = string
  default     = "laila.works"
}

# ---------------------------------------------------------------------------
# Lambda deployment packages (paths to zip files)
# ---------------------------------------------------------------------------

variable "nextjs_deployment_package" {
  description = "Path to the Next.js Lambda deployment package (zip file)"
  type        = string
  default     = "../../../deploy/functions/nextjs-server.zip"
}

variable "timeout_checker_package" {
  description = "Path to the timeout-checker Lambda deployment package (zip file)"
  type        = string
  default     = "../../../deploy/functions/timeout-checker.zip"
}

variable "dag_reconciler_package" {
  description = "Path to the dag-reconciler Lambda deployment package (zip file)"
  type        = string
  default     = "../../../deploy/functions/dag-reconciler.zip"
}

variable "audit_archiver_package" {
  description = "Path to the audit-archiver Lambda deployment package (zip file)"
  type        = string
  default     = "../../../deploy/functions/audit-archiver.zip"
}

variable "status_propagation_package" {
  description = "Path to the status-propagation Lambda deployment package (zip file)"
  type        = string
  default     = "../../../deploy/functions/status-propagation.zip"
}
