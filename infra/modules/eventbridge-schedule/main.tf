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
    mode                      = var.flexible_time_window_mode
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
