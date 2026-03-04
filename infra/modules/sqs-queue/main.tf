# Reusable Terraform module for SQS queues with DLQ.
# Configures: standard queue, dead letter queue, Lambda event source mapping.

# Dead Letter Queue — receives messages that fail processing
resource "aws_sqs_queue" "dlq" {
  name                      = "${var.queue_name}-dlq"
  message_retention_seconds = var.dlq_message_retention_seconds

  # Server-side encryption
  sqs_managed_sse_enabled = true

  tags = merge(var.tags, {
    Purpose = "Dead Letter Queue for ${var.queue_name}"
  })
}

# Main queue — processes status change events
resource "aws_sqs_queue" "this" {
  name                       = var.queue_name
  visibility_timeout_seconds = var.visibility_timeout_seconds
  message_retention_seconds  = var.message_retention_seconds
  receive_wait_time_seconds  = var.receive_wait_time_seconds

  # Dead Letter Queue configuration
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = var.max_receive_count  # Retries before DLQ
  })

  # Server-side encryption
  sqs_managed_sse_enabled = true

  tags = var.tags
}

# Redrive allow policy on DLQ — only the main queue can send to it
resource "aws_sqs_queue_redrive_allow_policy" "dlq" {
  queue_url = aws_sqs_queue.dlq.id

  redrive_allow_policy = jsonencode({
    redrivePermission = "byQueue"
    sourceQueueArns   = [aws_sqs_queue.this.arn]
  })
}

# Lambda event source mapping — triggers Lambda when messages arrive
resource "aws_lambda_event_source_mapping" "this" {
  count = var.lambda_function_arn != null ? 1 : 0

  event_source_arn = aws_sqs_queue.this.arn
  function_name    = var.lambda_function_arn
  batch_size       = var.lambda_batch_size

  # Maximum time to wait for a full batch before invoking Lambda
  maximum_batching_window_in_seconds = var.lambda_batching_window_seconds

  # Enable partial batch failure reporting
  # Only failed messages are retried, not the entire batch
  function_response_types = ["ReportBatchItemFailures"]

  # Scale Lambda concurrency based on queue depth
  scaling_config {
    maximum_concurrency = var.lambda_max_concurrency
  }
}
