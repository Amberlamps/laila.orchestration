# IAM policy for Lambda functions that publish custom CloudWatch metrics.
# Restricts PutMetricData to the "laila-works" namespace only.
#
# This policy is attached to all Lambda execution roles that
# use the @laila/metrics package:
#   - timeout-checker
#   - dag-reconciler
#   - audit-archiver
#   - work-assignment (Next.js API)

resource "aws_iam_policy" "cloudwatch_custom_metrics" {
  name        = "laila-cloudwatch-custom-metrics"
  description = "Allow publishing custom CloudWatch metrics to the laila-works namespace"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = "cloudwatch:PutMetricData"
      Resource = "*"
      Condition = {
        StringEquals = {
          "cloudwatch:namespace" = "laila-works"
        }
      }
    }]
  })

  tags = local.tags
}

# ---------------------------------------------------------------------------
# Attach the metrics policy to each Lambda execution role
# ---------------------------------------------------------------------------

locals {
  lambda_metrics_roles = {
    timeout-checker      = module.timeout_checker_lambda.execution_role_name
    dag-reconciler       = module.dag_reconciler_lambda.execution_role_name
    audit-archiver       = module.audit_archiver_lambda.execution_role_name
    nextjs-api           = module.nextjs_lambda.execution_role_name
    status-propagation   = module.status_propagation_lambda.execution_role_name
  }
}

resource "aws_iam_role_policy_attachment" "lambda_metrics" {
  for_each = local.lambda_metrics_roles

  role       = each.value
  policy_arn = aws_iam_policy.cloudwatch_custom_metrics.arn
}
