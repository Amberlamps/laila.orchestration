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
