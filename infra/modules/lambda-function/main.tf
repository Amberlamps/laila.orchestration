# Reusable Terraform module for AWS Lambda functions.
# Configures: Lambda function, IAM execution role, CloudWatch log group,
# X-Ray tracing, and environment variables from SSM Parameter Store.

resource "aws_lambda_function" "this" {
  function_name = var.function_name
  description   = var.description
  runtime       = "nodejs22.x"
  handler       = var.handler
  architectures = ["arm64"] # Graviton2 for better price/performance
  memory_size   = var.memory_size
  timeout       = var.timeout

  filename         = var.deployment_package
  source_code_hash = filebase64sha256(var.deployment_package)

  role = aws_iam_role.lambda_execution.arn

  # Environment variables — includes SSM references resolved at deploy time
  environment {
    variables = merge(
      var.environment_variables,
      {
        NODE_OPTIONS = "--enable-source-maps"
        LOG_LEVEL    = var.log_level
      }
    )
  }

  # X-Ray tracing for distributed tracing
  tracing_config {
    mode = "Active"
  }

  tags = var.tags
}

# CloudWatch Log Group with configurable retention
resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${var.function_name}"
  retention_in_days = var.log_retention_days

  tags = var.tags
}

# IAM execution role with least-privilege permissions
resource "aws_iam_role" "lambda_execution" {
  name = "${var.function_name}-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

# Basic Lambda execution policy (CloudWatch Logs)
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# X-Ray write access for tracing
resource "aws_iam_role_policy_attachment" "xray" {
  role       = aws_iam_role.lambda_execution.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

# SSM Parameter Store read access (for retrieving secrets at runtime)
resource "aws_iam_role_policy" "ssm_read" {
  count = length(var.ssm_parameter_arns) > 0 ? 1 : 0
  name  = "${var.function_name}-ssm-read"
  role  = aws_iam_role.lambda_execution.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["ssm:GetParameter", "ssm:GetParameters"]
        Resource = var.ssm_parameter_arns
      }
    ]
  })
}

# Additional IAM policies (e.g., DynamoDB, S3 access)
resource "aws_iam_role_policy" "additional" {
  for_each = var.additional_policies
  name     = "${var.function_name}-${each.key}"
  role     = aws_iam_role.lambda_execution.id
  policy   = each.value
}
