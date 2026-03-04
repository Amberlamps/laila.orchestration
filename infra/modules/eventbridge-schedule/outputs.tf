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
