# DynamoDB table for audit events.
# Schema aligns with packages/database/src/dynamo/schema.ts.

module "audit_events_table" {
  source = "../../modules/dynamodb-table"

  table_name = "audit-events"

  partition_key = {
    name = "entityId"
    type = "S"
  }

  sort_key = {
    name = "timestamp#eventId"
    type = "S"
  }

  additional_attributes = [
    {
      name = "actorId"
      type = "S"
    },
    {
      name = "timestamp"
      type = "S"
    },
    {
      name = "gsi1pk"
      type = "S"
    },
  ]

  global_secondary_indexes = [
    {
      name            = "actorId-timestamp-index"
      hash_key        = "actorId"
      range_key       = "timestamp"
      projection_type = "ALL"
    },
    {
      name            = "CrossProjectIndex"
      hash_key        = "gsi1pk"
      range_key       = "timestamp#eventId"
      projection_type = "ALL"
    },
  ]

  ttl_attribute = "expiresAt"
  pitr_enabled  = true

  tags = local.tags
}
