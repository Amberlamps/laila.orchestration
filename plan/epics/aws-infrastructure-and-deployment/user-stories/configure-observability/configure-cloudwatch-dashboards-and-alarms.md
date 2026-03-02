# Configure CloudWatch Dashboards and Alarms

## Task Details

- **Title:** Configure CloudWatch Dashboards and Alarms
- **Status:** Not Started
- **Assigned Agent:** sre-engineer
- **Parent User Story:** [Configure Observability](./tasks.md)
- **Parent Epic:** [AWS Infrastructure & Deployment](../../user-stories.md)
- **Dependencies:** Setup Pino Structured Logging

## Description

Create Terraform-managed CloudWatch dashboards for infrastructure monitoring and alarms for critical operational thresholds. The dashboard visualizes Lambda function performance, DynamoDB usage, API latency, error rates, and active executions. Alarms fire on Lambda errors, throttles, and duration threshold breaches, with notifications sent to an SNS topic connected to email.

### Dashboard Configuration

```hcl
# infra/environments/production/monitoring.tf
# CloudWatch dashboard and alarms for production monitoring.

resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "laila-works-production"

  dashboard_body = jsonencode({
    widgets = [
      # --- Lambda Function Metrics ---
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6
        properties = {
          title   = "Lambda Invocations"
          metrics = [
            ["AWS/Lambda", "Invocations", "FunctionName", "laila-works-nextjs"],
            ["...", "laila-works-timeout-checker"],
            ["...", "laila-works-dag-reconciler"],
            ["...", "laila-works-audit-archiver"],
            ["...", "laila-works-status-propagation"],
          ]
          period = 300
          stat   = "Sum"
          region = var.aws_region
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6
        properties = {
          title   = "Lambda Errors"
          metrics = [
            ["AWS/Lambda", "Errors", "FunctionName", "laila-works-nextjs"],
            ["...", "laila-works-timeout-checker"],
            ["...", "laila-works-dag-reconciler"],
            ["...", "laila-works-audit-archiver"],
            ["...", "laila-works-status-propagation"],
          ]
          period = 300
          stat   = "Sum"
          region = var.aws_region
        }
      },
      # Lambda Duration (P50, P90, P99)
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title   = "Lambda Duration (P50/P90/P99) — Next.js"
          metrics = [
            ["AWS/Lambda", "Duration", "FunctionName", "laila-works-nextjs", { stat = "p50" }],
            ["...", { stat = "p90" }],
            ["...", { stat = "p99" }],
          ]
          period = 300
          region = var.aws_region
        }
      },
      # --- DynamoDB Metrics ---
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6
        properties = {
          title   = "DynamoDB Read/Write Units"
          metrics = [
            ["AWS/DynamoDB", "ConsumedReadCapacityUnits", "TableName", "laila-works-audit-events"],
            ["AWS/DynamoDB", "ConsumedWriteCapacityUnits", "TableName", "laila-works-audit-events"],
          ]
          period = 300
          stat   = "Sum"
          region = var.aws_region
        }
      },
      # --- API Error Rates ---
      {
        type   = "metric"
        x      = 0
        y      = 12
        width  = 12
        height = 6
        properties = {
          title   = "4xx/5xx Error Rates"
          metrics = [
            ["laila-works", "4xxErrors", { stat = "Sum" }],
            ["laila-works", "5xxErrors", { stat = "Sum" }],
          ]
          period = 300
          region = var.aws_region
        }
      },
      # --- SQS Queue Depth ---
      {
        type   = "metric"
        x      = 12
        y      = 12
        width  = 12
        height = 6
        properties = {
          title   = "SQS Queue Depth"
          metrics = [
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", "laila-works-status-propagation"],
            ["AWS/SQS", "ApproximateNumberOfMessagesVisible", "QueueName", "laila-works-status-propagation-dlq"],
          ]
          period = 60
          stat   = "Maximum"
          region = var.aws_region
        }
      },
    ]
  })
}

# --- Alarms ---

# SNS topic for alarm notifications
resource "aws_sns_topic" "alarms" {
  name = "laila-works-alarms"
  tags = local.tags
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

# Alarm: Lambda errors
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  for_each = toset([
    "laila-works-nextjs",
    "laila-works-timeout-checker",
    "laila-works-dag-reconciler",
    "laila-works-audit-archiver",
    "laila-works-status-propagation",
  ])

  alarm_name          = "${each.value}-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "Lambda function ${each.value} has more than 5 errors in 10 minutes"

  dimensions = {
    FunctionName = each.value
  }

  alarm_actions = [aws_sns_topic.alarms.arn]
  ok_actions    = [aws_sns_topic.alarms.arn]

  tags = local.tags
}

# Alarm: Lambda throttles
resource "aws_cloudwatch_metric_alarm" "lambda_throttles" {
  alarm_name          = "laila-works-lambda-throttles"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Throttles"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Lambda functions are being throttled"

  alarm_actions = [aws_sns_topic.alarms.arn]

  tags = local.tags
}

# Alarm: Lambda duration threshold (Next.js > 10 seconds P99)
resource "aws_cloudwatch_metric_alarm" "nextjs_duration" {
  alarm_name          = "laila-works-nextjs-duration-p99"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "Duration"
  namespace           = "AWS/Lambda"
  period              = 300
  extended_statistic  = "p99"
  threshold           = 10000  # 10 seconds
  alarm_description   = "Next.js Lambda P99 duration exceeds 10 seconds"

  dimensions = {
    FunctionName = "laila-works-nextjs"
  }

  alarm_actions = [aws_sns_topic.alarms.arn]

  tags = local.tags
}

# Alarm: SQS DLQ has messages (processing failures)
resource "aws_cloudwatch_metric_alarm" "dlq_messages" {
  alarm_name          = "laila-works-dlq-messages"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 60
  statistic           = "Maximum"
  threshold           = 0
  alarm_description   = "Dead Letter Queue has messages — processing failures detected"

  dimensions = {
    QueueName = "laila-works-status-propagation-dlq"
  }

  alarm_actions = [aws_sns_topic.alarms.arn]

  tags = local.tags
}
```

## Acceptance Criteria

- [ ] CloudWatch dashboard exists named "laila-works-production"
- [ ] Dashboard shows Lambda invocations for all 5 functions
- [ ] Dashboard shows Lambda errors for all 5 functions
- [ ] Dashboard shows Lambda duration percentiles (P50, P90, P99) for Next.js function
- [ ] Dashboard shows DynamoDB read/write capacity units
- [ ] Dashboard shows 4xx/5xx error rates (custom metrics)
- [ ] Dashboard shows SQS queue depth for main queue and DLQ
- [ ] SNS topic is created for alarm notifications
- [ ] Email subscription is configured on the SNS topic
- [ ] Lambda error alarm fires when > 5 errors in 10 minutes (per function)
- [ ] Lambda throttle alarm fires on any throttle event
- [ ] Next.js duration alarm fires when P99 exceeds 10 seconds
- [ ] DLQ alarm fires when any messages appear in the Dead Letter Queue
- [ ] All alarms send both alarm and OK notifications
- [ ] All resources are tagged and managed by Terraform
- [ ] `terraform validate` passes

## Technical Notes

- The dashboard uses the CloudWatch dashboard JSON format. Each widget is positioned using a grid system (x, y, width, height) where the dashboard is 24 columns wide.
- Alarms use `for_each` to create one alarm per Lambda function, keeping the configuration DRY.
- The DLQ alarm uses a threshold of 0 because any message in the DLQ indicates a processing failure that needs investigation.
- P99 duration is used instead of average because averages hide tail latency. A few slow requests can indicate infrastructure issues before they become widespread.
- SNS email subscriptions require manual confirmation. After Terraform creates the subscription, the recipient must click the confirmation link in the email.

## References

- **CloudWatch Dashboards:** https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Dashboards.html
- **CloudWatch Alarms:** https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/AlarmThatSendsEmail.html
- **Terraform aws_cloudwatch_dashboard:** https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cloudwatch_dashboard

## Estimated Complexity

Medium — The dashboard JSON format is verbose but straightforward. The alarm configuration requires careful threshold selection. Terraform `for_each` keeps the alarm definitions manageable.
