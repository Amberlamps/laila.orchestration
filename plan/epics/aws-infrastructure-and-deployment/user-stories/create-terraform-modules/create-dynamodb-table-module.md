# Create DynamoDB Table Module

## Task Details

- **Title:** Create DynamoDB Table Module
- **Status:** Not Started
- **Assigned Agent:** terraform-engineer
- **Parent User Story:** [Create Terraform Modules](./tasks.md)
- **Parent Epic:** [AWS Infrastructure & Deployment](../../user-stories.md)
- **Dependencies:** None

## Description

Create a reusable Terraform module for DynamoDB tables at `infra/modules/dynamodb-table/`. This module supports on-demand billing, configurable partition and sort keys, Global Secondary Indexes (GSIs), Time-to-Live (TTL) configuration, and Point-in-Time Recovery (PITR).

### Module Structure

```hcl
# infra/modules/dynamodb-table/main.tf
# Reusable Terraform module for DynamoDB tables.
# Supports on-demand billing, GSIs, TTL, and PITR.

resource "aws_dynamodb_table" "this" {
  name         = var.table_name
  billing_mode = "PAY_PER_REQUEST"  # On-demand billing — no capacity planning needed
  hash_key     = var.partition_key.name
  range_key    = var.sort_key != null ? var.sort_key.name : null

  # Primary key attribute
  attribute {
    name = var.partition_key.name
    type = var.partition_key.type  # S (String), N (Number), B (Binary)
  }

  # Sort key attribute (optional)
  dynamic "attribute" {
    for_each = var.sort_key != null ? [var.sort_key] : []
    content {
      name = attribute.value.name
      type = attribute.value.type
    }
  }

  # Additional attributes used by GSIs
  dynamic "attribute" {
    for_each = var.additional_attributes
    content {
      name = attribute.value.name
      type = attribute.value.type
    }
  }

  # Global Secondary Indexes
  dynamic "global_secondary_index" {
    for_each = var.global_secondary_indexes
    content {
      name            = global_secondary_index.value.name
      hash_key        = global_secondary_index.value.hash_key
      range_key       = lookup(global_secondary_index.value, "range_key", null)
      projection_type = lookup(global_secondary_index.value, "projection_type", "ALL")
    }
  }

  # Time-to-Live (TTL) for automatic item expiration
  dynamic "ttl" {
    for_each = var.ttl_attribute != null ? [var.ttl_attribute] : []
    content {
      attribute_name = ttl.value
      enabled        = true
    }
  }

  # Point-in-Time Recovery for disaster recovery
  point_in_time_recovery {
    enabled = var.pitr_enabled
  }

  # Server-side encryption (AWS-managed key by default)
  server_side_encryption {
    enabled = true
  }

  tags = var.tags
}
```

### Variables

```hcl
# infra/modules/dynamodb-table/variables.tf

variable "table_name" {
  description = "Name of the DynamoDB table"
  type        = string
}

variable "partition_key" {
  description = "Partition key definition"
  type = object({
    name = string
    type = string  # S, N, or B
  })
}

variable "sort_key" {
  description = "Sort key definition (optional)"
  type = object({
    name = string
    type = string
  })
  default = null
}

variable "additional_attributes" {
  description = "Additional attributes used by GSIs"
  type = list(object({
    name = string
    type = string
  }))
  default = []
}

variable "global_secondary_indexes" {
  description = "Global Secondary Index definitions"
  type = list(object({
    name            = string
    hash_key        = string
    range_key       = optional(string)
    projection_type = optional(string, "ALL")
  }))
  default = []
}

variable "ttl_attribute" {
  description = "Name of the TTL attribute (null to disable TTL)"
  type        = string
  default     = null
}

variable "pitr_enabled" {
  description = "Enable Point-in-Time Recovery"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags to apply to the table"
  type        = map(string)
  default     = {}
}
```

### Outputs

```hcl
# infra/modules/dynamodb-table/outputs.tf

output "table_arn" {
  description = "ARN of the DynamoDB table"
  value       = aws_dynamodb_table.this.arn
}

output "table_name" {
  description = "Name of the DynamoDB table"
  value       = aws_dynamodb_table.this.name
}

output "table_id" {
  description = "ID of the DynamoDB table"
  value       = aws_dynamodb_table.this.id
}
```

## Acceptance Criteria

- [ ] Module exists at `infra/modules/dynamodb-table/` with standard Terraform files
- [ ] Billing mode is set to `PAY_PER_REQUEST` (on-demand)
- [ ] Partition key is configurable with name and type
- [ ] Sort key is optional and configurable
- [ ] GSIs are configurable via a list of objects
- [ ] TTL is configurable with an optional attribute name
- [ ] Point-in-Time Recovery is enabled by default
- [ ] Server-side encryption is enabled
- [ ] All resources are tagged
- [ ] Module outputs include table ARN, name, and ID
- [ ] `terraform validate` passes on the module

## Technical Notes

- On-demand billing (`PAY_PER_REQUEST`) is chosen over provisioned capacity because the audit log write patterns are bursty (spikes during active orchestration, quiet during off-hours). On-demand eliminates the need for capacity planning and auto-scaling configuration.
- PITR is enabled by default for disaster recovery. For the audit table, this provides a 35-day recovery window in addition to the S3 archival (Epic 13).
- The `dynamic` blocks for sort key and TTL use conditional `for_each` to handle optional configuration cleanly.

## References

- **Terraform Provider:** AWS (hashicorp/aws) >= 5.0
- **AWS Documentation:** https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/
- **DynamoDB Schema:** Audit events table (defined in Epic 3, Database Layer)

## Estimated Complexity

Low — Standard DynamoDB table configuration with dynamic blocks for optional features.
