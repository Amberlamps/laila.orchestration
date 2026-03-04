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
