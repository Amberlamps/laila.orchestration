# Create Lambda Function Module

## Task Details

- **Title:** Create Lambda Function Module
- **Status:** Not Started
- **Assigned Agent:** terraform-engineer
- **Parent User Story:** [Create Terraform Modules](./tasks.md)
- **Parent Epic:** [AWS Infrastructure & Deployment](../../user-stories.md)
- **Dependencies:** None

## Description

Create a reusable Terraform module for AWS Lambda functions at `infra/modules/lambda-function/`. This module encapsulates the common configuration shared by all Lambda functions in the project: ARM64 architecture, configurable memory, environment variables sourced from SSM Parameter Store, CloudWatch log groups with retention, X-Ray tracing, and least-privilege IAM roles.

### Module Structure

```hcl
# infra/modules/lambda-function/main.tf
# Reusable Terraform module for AWS Lambda functions.
# Configures: Lambda function, IAM execution role, CloudWatch log group,
# X-Ray tracing, and environment variables from SSM Parameter Store.

resource "aws_lambda_function" "this" {
  function_name = var.function_name
  description   = var.description
  runtime       = "nodejs22.x"
  handler       = var.handler
  architectures = ["arm64"]  # Graviton2 for better price/performance
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
        NODE_OPTIONS  = "--enable-source-maps"
        LOG_LEVEL     = var.log_level
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
```

### Variables

```hcl
# infra/modules/lambda-function/variables.tf
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
```

### Outputs

```hcl
# infra/modules/lambda-function/outputs.tf
# Output values for composing with other modules.

output "function_arn" {
  description = "ARN of the Lambda function"
  value       = aws_lambda_function.this.arn
}

output "function_name" {
  description = "Name of the Lambda function"
  value       = aws_lambda_function.this.function_name
}

output "invoke_arn" {
  description = "Invoke ARN (for API Gateway/ALB integration)"
  value       = aws_lambda_function.this.invoke_arn
}

output "execution_role_arn" {
  description = "ARN of the Lambda execution IAM role"
  value       = aws_iam_role.lambda_execution.arn
}

output "execution_role_name" {
  description = "Name of the Lambda execution IAM role"
  value       = aws_iam_role.lambda_execution.name
}

output "log_group_name" {
  description = "Name of the CloudWatch log group"
  value       = aws_cloudwatch_log_group.lambda.name
}
```

## Acceptance Criteria

- [ ] Module exists at `infra/modules/lambda-function/` with `main.tf`, `variables.tf`, `outputs.tf`, `versions.tf`
- [ ] Lambda function uses ARM64 architecture (Graviton2)
- [ ] Runtime is set to `nodejs22.x`
- [ ] Memory is configurable with a default of 512MB
- [ ] Timeout is configurable with a sensible default (30 seconds)
- [ ] Environment variables are configurable via a map input
- [ ] `NODE_OPTIONS=--enable-source-maps` is set automatically
- [ ] CloudWatch log group is created with configurable retention (default 90 days)
- [ ] X-Ray tracing is enabled in Active mode
- [ ] IAM execution role follows least-privilege principle
- [ ] SSM Parameter Store read access is conditionally added when ARNs are provided
- [ ] Additional IAM policies can be attached via the `additional_policies` variable
- [ ] All resources are tagged using the `tags` variable
- [ ] Module outputs include function ARN, invoke ARN, execution role ARN, and log group name
- [ ] `terraform validate` passes on the module

## Technical Notes

- The module uses `for_each` for additional policies to support multiple policy attachments without index-based addressing issues.
- The `source_code_hash` parameter ensures Lambda detects code changes and updates the function on deploy.
- X-Ray is enabled at the Lambda level. Application-level instrumentation (AWS SDK auto-tracing) is handled in the application code.
- The `NODE_OPTIONS=--enable-source-maps` environment variable allows Node.js to use source maps in error stack traces, which is critical for debugging minified/bundled Lambda code.

## References

- **Terraform Provider:** AWS (hashicorp/aws) >= 5.0
- **Lambda Runtime:** Node.js 22.x on ARM64
- **AWS Documentation:** https://docs.aws.amazon.com/lambda/latest/dg/configuration-function-common.html

## Estimated Complexity

Medium — Standard Terraform module with several resource types. The main complexity is in the IAM role configuration with conditional SSM access and dynamic additional policies.
