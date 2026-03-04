# Production environment configuration.
# Composes all Terraform modules into the complete laila.works infrastructure.

# --- Locals ---

locals {
  tags = {
    Service = "laila-works"
  }
}

# --- Lambda Functions ---

# Next.js application (deployed via OpenNext)
module "nextjs_lambda" {
  source = "../../modules/lambda-function"

  function_name      = "laila-works-nextjs"
  description        = "Next.js 14 application via OpenNext v3"
  handler            = "index.handler"
  memory_size        = 1024
  timeout            = 30
  deployment_package = var.nextjs_deployment_package

  environment_variables = {
    DATABASE_URL         = data.aws_ssm_parameter.database_url.value
    BETTER_AUTH_SECRET   = data.aws_ssm_parameter.better_auth_secret.value
    GOOGLE_CLIENT_ID     = var.google_client_id
    GOOGLE_CLIENT_SECRET = data.aws_ssm_parameter.google_client_secret.value
    AUDIT_TABLE_NAME     = module.audit_table.table_name
    SQS_QUEUE_URL        = module.status_propagation_queue.queue_url
    NODE_ENV             = "production"
  }

  ssm_parameter_arns = [
    data.aws_ssm_parameter.database_url.arn,
    data.aws_ssm_parameter.better_auth_secret.arn,
    data.aws_ssm_parameter.google_client_secret.arn,
  ]

  additional_policies = {
    dynamodb = jsonencode({
      Version = "2012-10-17"
      Statement = [{
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:Query"]
        Resource = module.audit_table.table_arn
      }]
    })
    sqs = jsonencode({
      Version = "2012-10-17"
      Statement = [{
        Effect   = "Allow"
        Action   = ["sqs:SendMessage"]
        Resource = module.status_propagation_queue.queue_arn
      }]
    })
  }

  tags = local.tags
}

# Timeout Checker Lambda — invoked every 1 minute
module "timeout_checker_lambda" {
  source = "../../modules/lambda-function"

  function_name      = "laila-works-timeout-checker"
  description        = "Checks for and reclaims timed-out story assignments"
  memory_size        = 512
  timeout            = 30
  deployment_package = var.timeout_checker_package

  environment_variables = {
    DATABASE_URL     = data.aws_ssm_parameter.database_url.value
    AUDIT_TABLE_NAME = module.audit_table.table_name
  }

  ssm_parameter_arns = [data.aws_ssm_parameter.database_url.arn]

  additional_policies = {
    dynamodb = jsonencode({
      Version = "2012-10-17"
      Statement = [{
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem"]
        Resource = module.audit_table.table_arn
      }]
    })
  }

  tags = local.tags
}

# DAG Reconciler Lambda — invoked every 5 minutes
module "dag_reconciler_lambda" {
  source = "../../modules/lambda-function"

  function_name      = "laila-works-dag-reconciler"
  description        = "Performs full-graph consistency checks and fixes status inconsistencies"
  memory_size        = 512
  timeout            = 60
  deployment_package = var.dag_reconciler_package

  environment_variables = {
    DATABASE_URL     = data.aws_ssm_parameter.database_url.value
    AUDIT_TABLE_NAME = module.audit_table.table_name
  }

  ssm_parameter_arns = [data.aws_ssm_parameter.database_url.arn]

  additional_policies = {
    dynamodb = jsonencode({
      Version = "2012-10-17"
      Statement = [{
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem"]
        Resource = module.audit_table.table_arn
      }]
    })
  }

  tags = local.tags
}

# Audit Archiver Lambda — invoked daily at 02:00 UTC
module "audit_archiver_lambda" {
  source = "../../modules/lambda-function"

  function_name      = "laila-works-audit-archiver"
  description        = "Archives old audit events from DynamoDB to S3"
  memory_size        = 1024
  timeout            = 900 # 15 minutes for large archives
  deployment_package = var.audit_archiver_package

  environment_variables = {
    AUDIT_TABLE_NAME = module.audit_table.table_name
    ARCHIVE_BUCKET   = module.audit_archive_bucket.bucket_name
    RETENTION_DAYS   = "90"
  }

  additional_policies = {
    dynamodb = jsonencode({
      Version = "2012-10-17"
      Statement = [{
        Effect   = "Allow"
        Action   = ["dynamodb:Scan"]
        Resource = module.audit_table.table_arn
      }]
    })
    s3 = jsonencode({
      Version = "2012-10-17"
      Statement = [{
        Effect   = "Allow"
        Action   = ["s3:PutObject"]
        Resource = "${module.audit_archive_bucket.bucket_arn}/audit/*"
      }]
    })
  }

  tags = local.tags
}

# Status Propagation Consumer Lambda — triggered by SQS
module "status_propagation_lambda" {
  source = "../../modules/lambda-function"

  function_name      = "laila-works-status-propagation"
  description        = "Processes cascading status re-evaluation events from SQS"
  memory_size        = 512
  timeout            = 30
  deployment_package = var.status_propagation_package

  environment_variables = {
    DATABASE_URL     = data.aws_ssm_parameter.database_url.value
    AUDIT_TABLE_NAME = module.audit_table.table_name
  }

  ssm_parameter_arns = [data.aws_ssm_parameter.database_url.arn]

  additional_policies = {
    dynamodb = jsonencode({
      Version = "2012-10-17"
      Statement = [{
        Effect   = "Allow"
        Action   = ["dynamodb:PutItem", "dynamodb:GetItem"]
        Resource = module.audit_table.table_arn
      }]
    })
    sqs = jsonencode({
      Version = "2012-10-17"
      Statement = [{
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = module.status_propagation_queue.queue_arn
      }]
    })
  }

  tags = local.tags
}

# --- DynamoDB ---

module "audit_table" {
  source = "../../modules/dynamodb-table"

  table_name = "laila-works-audit-events"

  partition_key = { name = "pk", type = "S" }
  sort_key      = { name = "sk", type = "S" }

  additional_attributes = [
    { name = "projectId", type = "S" },
    { name = "timestamp", type = "S" },
  ]

  global_secondary_indexes = [
    {
      name      = "project-timestamp-index"
      hash_key  = "projectId"
      range_key = "timestamp"
    }
  ]

  ttl_attribute = "ttl"
  pitr_enabled  = true

  tags = local.tags
}

# --- SQS ---

module "status_propagation_queue" {
  source = "../../modules/sqs-queue"

  queue_name                 = "laila-works-status-propagation"
  visibility_timeout_seconds = 180
  message_retention_seconds  = 345600 # 4 days
  max_receive_count          = 3
  lambda_function_arn        = module.status_propagation_lambda.function_arn
  lambda_batch_size          = 10
  lambda_max_concurrency     = 10

  tags = local.tags
}

# --- EventBridge Schedules ---

module "timeout_checker_schedule" {
  source = "../../modules/eventbridge-schedule"

  schedule_name       = "laila-works-timeout-checker"
  description         = "Invokes timeout checker every 1 minute"
  schedule_expression = "rate(1 minute)"
  lambda_function_arn = module.timeout_checker_lambda.function_arn

  tags = local.tags
}

module "dag_reconciler_schedule" {
  source = "../../modules/eventbridge-schedule"

  schedule_name       = "laila-works-dag-reconciler"
  description         = "Invokes DAG reconciler every 5 minutes"
  schedule_expression = "rate(5 minutes)"
  lambda_function_arn = module.dag_reconciler_lambda.function_arn

  tags = local.tags
}

module "audit_archiver_schedule" {
  source = "../../modules/eventbridge-schedule"

  schedule_name       = "laila-works-audit-archiver"
  description         = "Invokes audit archiver daily at 02:00 UTC"
  schedule_expression = "cron(0 2 * * ? *)"
  lambda_function_arn = module.audit_archiver_lambda.function_arn

  tags = local.tags
}

# --- S3 Buckets ---

module "static_assets_bucket" {
  source = "../../modules/s3-bucket"

  bucket_name        = "laila-works-static-assets"
  versioning_enabled = true

  tags = local.tags
}

module "audit_archive_bucket" {
  source = "../../modules/s3-bucket"

  bucket_name        = "laila-works-audit-archive"
  versioning_enabled = false

  lifecycle_rules = [
    {
      id     = "intelligent-tiering"
      prefix = "audit/"
      transitions = [
        { days = 30, storage_class = "INTELLIGENT_TIERING" },
      ]
    }
  ]

  tags = local.tags
}
