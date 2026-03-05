# SSM Parameter Store configuration for application secrets.
# All secrets are stored as SecureString with KMS encryption.
# Values are set manually via the AWS Console or CLI — Terraform only
# manages the parameter definitions, not the secret values.

# KMS key for encrypting SSM SecureString parameters
resource "aws_kms_key" "secrets" {
  description             = "KMS key for laila.works SSM SecureString parameters"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  tags = local.tags
}

resource "aws_kms_alias" "secrets" {
  name          = "alias/laila-works-secrets"
  target_key_id = aws_kms_key.secrets.key_id
}

# Database connection string for Neon PostgreSQL
resource "aws_ssm_parameter" "database_url" {
  name        = "/laila-works/production/DATABASE_URL"
  description = "Neon PostgreSQL connection string"
  type        = "SecureString"
  value       = "placeholder" # Set actual value via AWS CLI after creation
  key_id      = aws_kms_key.secrets.arn

  lifecycle {
    # Prevent Terraform from overwriting manually-set values
    ignore_changes = [value]
  }

  tags = local.tags
}

# Better Auth secret key for session signing
resource "aws_ssm_parameter" "better_auth_secret" {
  name        = "/laila-works/production/BETTER_AUTH_SECRET"
  description = "Secret key for Better Auth session signing"
  type        = "SecureString"
  value       = "placeholder"
  key_id      = aws_kms_key.secrets.arn

  lifecycle {
    ignore_changes = [value]
  }

  tags = local.tags
}

# Google OAuth client secret
resource "aws_ssm_parameter" "google_client_secret" {
  name        = "/laila-works/production/GOOGLE_CLIENT_SECRET"
  description = "Google OAuth 2.0 client secret"
  type        = "SecureString"
  value       = "placeholder"
  key_id      = aws_kms_key.secrets.arn

  lifecycle {
    ignore_changes = [value]
  }

  tags = local.tags
}

# API key encryption key for worker API keys
resource "aws_ssm_parameter" "api_key_encryption_key" {
  name        = "/laila-works/production/API_KEY_ENCRYPTION_KEY"
  description = "Encryption key for worker API key hashing"
  type        = "SecureString"
  value       = "placeholder"
  key_id      = aws_kms_key.secrets.arn

  lifecycle {
    ignore_changes = [value]
  }

  tags = local.tags
}

# Data sources for referencing parameters in Lambda environment variables
data "aws_ssm_parameter" "database_url" {
  name            = aws_ssm_parameter.database_url.name
  with_decryption = true
}

data "aws_ssm_parameter" "better_auth_secret" {
  name            = aws_ssm_parameter.better_auth_secret.name
  with_decryption = true
}

data "aws_ssm_parameter" "google_client_secret" {
  name            = aws_ssm_parameter.google_client_secret.name
  with_decryption = true
}

# Fail fast if required secret/config parameters are still placeholder values.
# This prevents deploying Lambdas with invalid runtime config that causes
# 500s on auth and API endpoints.
check "production_ssm_values" {
  assert {
    condition = (
      startswith(data.aws_ssm_parameter.database_url.value, "postgres://") ||
      startswith(data.aws_ssm_parameter.database_url.value, "postgresql://")
    )
    error_message = "SSM parameter /laila-works/production/DATABASE_URL must be a valid PostgreSQL URL (postgres:// or postgresql://), not a placeholder value."
  }

  assert {
    condition = (
      trimspace(data.aws_ssm_parameter.better_auth_secret.value) != "" &&
      trimspace(data.aws_ssm_parameter.better_auth_secret.value) != "placeholder" &&
      length(trimspace(data.aws_ssm_parameter.better_auth_secret.value)) >= 32
    )
    error_message = "SSM parameter /laila-works/production/BETTER_AUTH_SECRET must be a real secret (non-placeholder, at least 32 characters)."
  }

  assert {
    condition = (
      trimspace(data.aws_ssm_parameter.google_client_secret.value) != "" &&
      trimspace(data.aws_ssm_parameter.google_client_secret.value) != "placeholder"
    )
    error_message = "SSM parameter /laila-works/production/GOOGLE_CLIENT_SECRET must be set to the real OAuth client secret, not placeholder."
  }
}
