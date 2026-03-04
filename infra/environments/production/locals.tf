# infra/environments/production/locals.tf
# Shared local values for the production environment.

locals {
  tags = {
    Project     = "laila-works"
    Environment = "production"
    ManagedBy   = "terraform"
  }
}
