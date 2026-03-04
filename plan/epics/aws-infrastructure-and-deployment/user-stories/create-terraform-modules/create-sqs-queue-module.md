# Create SQS Queue Module

## Task Details

- **Title:** Create SQS Queue Module
- **Status:** Complete
- **Assigned Agent:** terraform-engineer
- **Parent User Story:** [Create Terraform Modules](./tasks.md)
- **Parent Epic:** [AWS Infrastructure & Deployment](../../user-stories.md)
- **Dependencies:** None

## Description

Create a reusable Terraform module for SQS queues at `infra/modules/sqs-queue/`. This module creates a standard SQS queue with a Dead Letter Queue (DLQ), configurable retry count, message retention, and Lambda trigger configuration.

### Module Structure

```hcl
# infra/modules/sqs-queue/main.tf
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
```

### Variables

```hcl
# infra/modules/sqs-queue/variables.tf

variable "queue_name" {
  description = "Name of the SQS queue"
  type        = string
}

variable "visibility_timeout_seconds" {
  description = "Visibility timeout (should be 6x Lambda timeout)"
  type        = number
  default     = 180  # 3 minutes (6x 30s Lambda timeout)
}

variable "message_retention_seconds" {
  description = "How long messages are retained in the queue"
  type        = number
  default     = 345600  # 4 days
}

variable "receive_wait_time_seconds" {
  description = "Long polling wait time (0-20 seconds)"
  type        = number
  default     = 20  # Maximum long polling for cost efficiency
}

variable "max_receive_count" {
  description = "Number of processing attempts before sending to DLQ"
  type        = number
  default     = 3
}

variable "dlq_message_retention_seconds" {
  description = "How long messages are retained in the DLQ"
  type        = number
  default     = 1209600  # 14 days
}

variable "lambda_function_arn" {
  description = "ARN of the Lambda function to trigger (null to skip event source mapping)"
  type        = string
  default     = null
}

variable "lambda_batch_size" {
  description = "Maximum number of messages per Lambda invocation"
  type        = number
  default     = 10
}

variable "lambda_batching_window_seconds" {
  description = "Maximum time to wait for a full batch"
  type        = number
  default     = 5
}

variable "lambda_max_concurrency" {
  description = "Maximum concurrent Lambda invocations for this queue"
  type        = number
  default     = 10
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
```

### Outputs

```hcl
# infra/modules/sqs-queue/outputs.tf

output "queue_arn" {
  description = "ARN of the main SQS queue"
  value       = aws_sqs_queue.this.arn
}

output "queue_url" {
  description = "URL of the main SQS queue"
  value       = aws_sqs_queue.this.url
}

output "queue_name" {
  description = "Name of the main SQS queue"
  value       = aws_sqs_queue.this.name
}

output "dlq_arn" {
  description = "ARN of the Dead Letter Queue"
  value       = aws_sqs_queue.dlq.arn
}

output "dlq_url" {
  description = "URL of the Dead Letter Queue"
  value       = aws_sqs_queue.dlq.url
}
```

## Acceptance Criteria

- [ ] Module exists at `infra/modules/sqs-queue/` with standard Terraform files
- [ ] Standard queue is created (not FIFO) with configurable name
- [ ] Dead Letter Queue is created alongside the main queue
- [ ] Redrive policy is configured with `maxReceiveCount` (default 3)
- [ ] Redrive allow policy restricts DLQ to only accept from the main queue
- [ ] Visibility timeout is configurable (default 180s = 6x 30s Lambda timeout)
- [ ] Message retention is configurable (default 4 days)
- [ ] Long polling is enabled (default 20 seconds)
- [ ] Lambda event source mapping is optionally created when `lambda_function_arn` is provided
- [ ] Partial batch failure reporting is enabled (`ReportBatchItemFailures`)
- [ ] Lambda concurrency scaling is configurable
- [ ] Server-side encryption is enabled on both queues
- [ ] All resources are tagged
- [ ] Module outputs include queue ARN, URL, name, and DLQ ARN/URL
- [ ] `terraform validate` passes

## Technical Notes

- The visibility timeout must be at least 6x the Lambda function timeout. If a Lambda function takes 30 seconds, set visibility timeout to 180 seconds. This prevents messages from becoming visible again while still being processed.
- `ReportBatchItemFailures` is critical: without it, if the Lambda handler throws on any message in a batch, ALL messages are retried (even ones that were processed successfully). With it, only specifically reported failures are retried.
- Long polling (`receive_wait_time_seconds = 20`) reduces the number of empty receives and lowers costs.
- DLQ retention is set to 14 days by default, providing ample time to investigate and replay failed messages.

## References

- **Terraform Provider:** AWS (hashicorp/aws) >= 5.0
- **AWS SQS Documentation:** https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/
- **Lambda SQS Integration:** https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html
- **Consumer:** [SQS Status Propagation Consumer](../../../background-jobs-and-scheduled-tasks/user-stories/implement-sqs-status-propagation-consumer/tasks.md) (Epic 13)

## Estimated Complexity

Medium — Multiple resources (queue, DLQ, policies, event source mapping) with several interrelated configuration parameters. The partial batch failure configuration is a subtle but critical detail.
