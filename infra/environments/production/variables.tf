# Input variables for the production environment.

variable "aws_region" {
  description = "Primary AWS region for resource deployment"
  type        = string
  default     = "us-east-1"
}

variable "domain_name" {
  description = "Primary domain name for the application (e.g., laila.works)"
  type        = string
  default     = "laila.works"
}

# --- Deployment Packages ---

variable "nextjs_deployment_package" {
  description = "Path to the Next.js Lambda deployment package (zip file)"
  type        = string
}

variable "timeout_checker_package" {
  description = "Path to the timeout-checker Lambda deployment package (zip file)"
  type        = string
}

variable "dag_reconciler_package" {
  description = "Path to the dag-reconciler Lambda deployment package (zip file)"
  type        = string
}

variable "audit_archiver_package" {
  description = "Path to the audit-archiver Lambda deployment package (zip file)"
  type        = string
}

variable "status_propagation_package" {
  description = "Path to the status-propagation Lambda deployment package (zip file)"
  type        = string
}

# --- Application Configuration ---

variable "google_client_id" {
  description = "Google OAuth client ID for authentication"
  type        = string
}
