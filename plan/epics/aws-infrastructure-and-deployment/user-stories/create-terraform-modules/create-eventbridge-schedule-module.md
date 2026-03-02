# Create EventBridge Schedule Module

## Task Details

- **Title:** Create EventBridge Schedule Module
- **Status:** Not Started
- **Assigned Agent:** terraform-engineer
- **Parent User Story:** [Create Terraform Modules](./tasks.md)
- **Parent Epic:** [AWS Infrastructure & Deployment](../../user-stories.md)
- **Dependencies:** None

## Description

Create a reusable Terraform module for EventBridge Scheduler schedules at `infra/modules/eventbridge-schedule/`. This module creates a schedule that invokes a Lambda function on a cron expression, with its own IAM role for invoking the target and a configurable retry policy.

### Module Structure

```hcl
# infra/modules/eventbridge-schedule/main.tf
# Reusable Terraform module for EventBridge Scheduler.
# Creates a schedule that invokes a Lambda function on a cron expression.

resource "aws_scheduler_schedule" "this" {
  name        = var.schedule_name
  description = var.description
  group_name  = var.schedule_group

  # Schedule expression — cron or rate
  # Examples: "rate(1 minute)", "cron(0 2 * * ? *)" (daily at 02:00 UTC)
  schedule_expression          = var.schedule_expression
  schedule_expression_timezone = var.timezone

  # Flexible time window — disabled for precise scheduling
  flexible_time_window {
    mode = var.flexible_time_window_mode
    maximum_window_in_minutes = var.flexible_time_window_mode == "FLEXIBLE" ? var.flexible_window_minutes : null
  }

  # Lambda target
  target {
    arn      = var.lambda_function_arn
    role_arn = aws_iam_role.scheduler.arn

    # Retry policy for failed invocations
    retry_policy {
      maximum_event_age_in_seconds = var.maximum_event_age_seconds
      maximum_retry_attempts       = var.maximum_retry_attempts
    }

    # Optional: DLQ for failed invocations
    dynamic "dead_letter_config" {
      for_each = var.dlq_arn != null ? [1] : []
      content {
        arn = var.dlq_arn
      }
    }

    # Input payload (optional)
    input = var.input_payload
  }

  state = var.enabled ? "ENABLED" : "DISABLED"
}

# IAM role for EventBridge Scheduler to invoke the Lambda function
resource "aws_iam_role" "scheduler" {
  name = "${var.schedule_name}-scheduler-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "scheduler.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

# Policy allowing the scheduler to invoke the specific Lambda function
resource "aws_iam_role_policy" "invoke_lambda" {
  name = "${var.schedule_name}-invoke-lambda"
  role = aws_iam_role.scheduler.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = "lambda:InvokeFunction"
        Resource = var.lambda_function_arn
      }
    ]
  })
}
```

### Variables

```hcl
# infra/modules/eventbridge-schedule/variables.tf

variable "schedule_name" {
  description = "Name of the EventBridge schedule"
  type        = string
}

variable "description" {
  description = "Description of the schedule's purpose"
  type        = string
  default     = ""
}

variable "schedule_group" {
  description = "EventBridge Scheduler group name"
  type        = string
  default     = "default"
}

variable "schedule_expression" {
  description = "Schedule expression (cron or rate). Examples: 'rate(1 minute)', 'cron(0 2 * * ? *)'"
  type        = string
}

variable "timezone" {
  description = "Timezone for the schedule expression"
  type        = string
  default     = "UTC"
}

variable "lambda_function_arn" {
  description = "ARN of the Lambda function to invoke"
  type        = string
}

variable "maximum_retry_attempts" {
  description = "Maximum number of retry attempts for failed invocations"
  type        = number
  default     = 2
}

variable "maximum_event_age_seconds" {
  description = "Maximum age of an event before it is dropped"
  type        = number
  default     = 3600  # 1 hour
}

variable "dlq_arn" {
  description = "ARN of the DLQ for failed schedule invocations (optional)"
  type        = string
  default     = null
}

variable "input_payload" {
  description = "JSON input payload to pass to the Lambda function (optional)"
  type        = string
  default     = null
}

variable "flexible_time_window_mode" {
  description = "Flexible time window mode: OFF or FLEXIBLE"
  type        = string
  default     = "OFF"
}

variable "flexible_window_minutes" {
  description = "Maximum window in minutes for FLEXIBLE mode"
  type        = number
  default     = null
}

variable "enabled" {
  description = "Whether the schedule is enabled"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
```

### Outputs

```hcl
# infra/modules/eventbridge-schedule/outputs.tf

output "schedule_arn" {
  description = "ARN of the EventBridge schedule"
  value       = aws_scheduler_schedule.this.arn
}

output "schedule_name" {
  description = "Name of the EventBridge schedule"
  value       = aws_scheduler_schedule.this.name
}

output "scheduler_role_arn" {
  description = "ARN of the IAM role used by the scheduler"
  value       = aws_iam_role.scheduler.arn
}
```

## Acceptance Criteria

- [ ] Module exists at `infra/modules/eventbridge-schedule/` with standard Terraform files
- [ ] Schedule supports both `cron()` and `rate()` expressions
- [ ] Timezone is configurable (default UTC)
- [ ] Lambda function is configured as the schedule target
- [ ] IAM role is created with least-privilege: only `lambda:InvokeFunction` on the target
- [ ] Retry policy is configurable (default: 2 retries, 1 hour max event age)
- [ ] Dead Letter Queue is optionally configurable for failed invocations
- [ ] Custom input payload is optionally configurable
- [ ] Schedule can be enabled or disabled via variable
- [ ] Flexible time window is configurable
- [ ] All resources are tagged
- [ ] Module outputs include schedule ARN, name, and scheduler role ARN
- [ ] `terraform validate` passes

## Technical Notes

- EventBridge Scheduler is used instead of EventBridge Rules because it provides better features for scheduled Lambda invocations: timezone support, flexible time windows, per-schedule retry policies, and built-in DLQ support.
- Three schedules will be created from this module in production:
  1. **timeout-checker**: `rate(1 minute)` — checks for timed-out story assignments
  2. **dag-reconciler**: `rate(5 minutes)` — performs full-graph consistency checks
  3. **audit-archiver**: `cron(0 2 * * ? *)` — daily at 02:00 UTC for audit archival
- Each schedule gets its own IAM role scoped to only the target Lambda function, following the principle of least privilege.

## References

- **Terraform Provider:** AWS (hashicorp/aws) >= 5.0
- **AWS Documentation:** https://docs.aws.amazon.com/scheduler/latest/UserGuide/
- **Lambda Targets:** Timeout Checker, DAG Reconciler, Audit Archiver (Epic 13)

## Estimated Complexity

Low — Simple module with a schedule resource and an IAM role. The main consideration is correctly configuring the schedule expression and retry policy.
