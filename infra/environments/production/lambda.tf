# Lambda function definitions for all production workloads.

# ---------------------------------------------------------------------------
# SSM parameter ARNs (shared across Lambda functions that need secrets)
# ---------------------------------------------------------------------------

locals {
  ssm_parameter_arns = [
    aws_ssm_parameter.database_url.arn,
    aws_ssm_parameter.better_auth_secret.arn,
    aws_ssm_parameter.google_client_secret.arn,
    aws_ssm_parameter.api_key_encryption_key.arn,
    aws_kms_key.secrets.arn,
  ]
}

# ---------------------------------------------------------------------------
# Next.js SSR/API Lambda (serves all dynamic requests via CloudFront)
# ---------------------------------------------------------------------------

module "nextjs_lambda" {
  source = "../../modules/lambda-function"

  function_name      = "laila-works-nextjs"
  description        = "Next.js SSR and API routes (OpenNext)"
  handler            = "index.handler"
  deployment_package = var.nextjs_deployment_package
  memory_size        = 1024
  timeout            = 30

  environment_variables = {
    DATABASE_URL         = data.aws_ssm_parameter.database_url.value
    BETTER_AUTH_SECRET   = data.aws_ssm_parameter.better_auth_secret.value
    BETTER_AUTH_URL      = "https://${var.domain_name}"
    GOOGLE_CLIENT_ID     = var.google_client_id
    GOOGLE_CLIENT_SECRET = data.aws_ssm_parameter.google_client_secret.value
    NEXT_PUBLIC_APP_URL  = "https://${var.domain_name}"
  }

  ssm_parameter_arns = local.ssm_parameter_arns

  tags = local.tags
}

# ---------------------------------------------------------------------------
# Timeout Checker Lambda (scheduled via EventBridge)
# ---------------------------------------------------------------------------

module "timeout_checker_lambda" {
  source = "../../modules/lambda-function"

  function_name      = "laila-works-timeout-checker"
  description        = "Checks for timed-out tasks and updates their status"
  deployment_package = var.timeout_checker_package
  memory_size        = 512
  timeout            = 60

  environment_variables = {
    DATABASE_URL = data.aws_ssm_parameter.database_url.value
  }

  ssm_parameter_arns = local.ssm_parameter_arns

  tags = local.tags
}

# ---------------------------------------------------------------------------
# DAG Reconciler Lambda (scheduled via EventBridge)
# ---------------------------------------------------------------------------

module "dag_reconciler_lambda" {
  source = "../../modules/lambda-function"

  function_name      = "laila-works-dag-reconciler"
  description        = "Reconciles DAG state for dependency management"
  deployment_package = var.dag_reconciler_package
  memory_size        = 512
  timeout            = 60

  environment_variables = {
    DATABASE_URL = data.aws_ssm_parameter.database_url.value
  }

  ssm_parameter_arns = local.ssm_parameter_arns

  tags = local.tags
}

# ---------------------------------------------------------------------------
# Audit Archiver Lambda (scheduled via EventBridge)
# ---------------------------------------------------------------------------

module "audit_archiver_lambda" {
  source = "../../modules/lambda-function"

  function_name      = "laila-works-audit-archiver"
  description        = "Archives audit events from DynamoDB to S3"
  deployment_package = var.audit_archiver_package
  memory_size        = 512
  timeout            = 120

  environment_variables = {
    DATABASE_URL = data.aws_ssm_parameter.database_url.value
  }

  ssm_parameter_arns = local.ssm_parameter_arns

  tags = local.tags
}

# ---------------------------------------------------------------------------
# Status Propagation Lambda (triggered via SQS)
# ---------------------------------------------------------------------------

module "status_propagation_lambda" {
  source = "../../modules/lambda-function"

  function_name      = "laila-works-status-propagation"
  description        = "Propagates status changes through the task dependency graph"
  deployment_package = var.status_propagation_package
  memory_size        = 512
  timeout            = 30

  environment_variables = {
    DATABASE_URL = data.aws_ssm_parameter.database_url.value
  }

  ssm_parameter_arns = local.ssm_parameter_arns

  tags = local.tags
}
