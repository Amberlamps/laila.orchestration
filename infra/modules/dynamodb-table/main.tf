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
