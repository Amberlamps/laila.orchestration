# infra/environments/production/monitoring.tf
# CloudWatch dashboard and alarms for production monitoring.

# ---------------------------------------------------------------------------
# CloudWatch Dashboard
# ---------------------------------------------------------------------------

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
          title = "Lambda Invocations"
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
          title = "Lambda Errors"
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
      # Lambda Duration (P50, P90, P99) — Next.js
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6
        properties = {
          title = "Lambda Duration (P50/P90/P99) — Next.js"
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
          title = "DynamoDB Read/Write Units"
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
          title = "4xx/5xx Error Rates"
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
          title = "SQS Queue Depth"
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

# ---------------------------------------------------------------------------
# SNS Topic for Alarm Notifications
# ---------------------------------------------------------------------------

resource "aws_sns_topic" "alarms" {
  name = "laila-works-alarms"
  tags = local.tags
}

resource "aws_sns_topic_subscription" "email" {
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

# ---------------------------------------------------------------------------
# Alarm: Lambda Errors (per function)
# ---------------------------------------------------------------------------

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

# ---------------------------------------------------------------------------
# Alarm: Lambda Throttles (any function)
# ---------------------------------------------------------------------------

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
  ok_actions    = [aws_sns_topic.alarms.arn]

  tags = local.tags
}

# ---------------------------------------------------------------------------
# Alarm: Next.js Lambda Duration P99 > 10 seconds
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_metric_alarm" "nextjs_duration" {
  alarm_name          = "laila-works-nextjs-duration-p99"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 3
  metric_name         = "Duration"
  namespace           = "AWS/Lambda"
  period              = 300
  extended_statistic  = "p99"
  threshold           = 10000 # 10 seconds in milliseconds
  alarm_description   = "Next.js Lambda P99 duration exceeds 10 seconds"

  dimensions = {
    FunctionName = "laila-works-nextjs"
  }

  alarm_actions = [aws_sns_topic.alarms.arn]
  ok_actions    = [aws_sns_topic.alarms.arn]

  tags = local.tags
}

# ---------------------------------------------------------------------------
# Alarm: SQS Dead Letter Queue has messages (processing failures)
# ---------------------------------------------------------------------------

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
  ok_actions    = [aws_sns_topic.alarms.arn]

  tags = local.tags
}
