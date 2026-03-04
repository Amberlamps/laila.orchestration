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
  default     = 3600 # 1 hour
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
