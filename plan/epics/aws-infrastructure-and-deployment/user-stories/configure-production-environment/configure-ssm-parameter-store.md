# Configure SSM Parameter Store

## Task Details

- **Title:** Configure SSM Parameter Store
- **Status:** Not Started
- **Assigned Agent:** terraform-engineer
- **Parent User Story:** [Configure Production Environment](./tasks.md)
- **Parent Epic:** [AWS Infrastructure & Deployment](../../user-stories.md)
- **Dependencies:** Setup Terraform Backend

## Description

Define SSM parameters for all application secrets used by Lambda functions. All secrets are stored as `SecureString` type with KMS encryption. Lambda functions reference these parameters via environment variables, with IAM policies granting read access to only the parameters each function needs.

### SSM Parameter Configuration

```hcl
# infra/environments/production/ssm.tf
# SSM Parameter Store configuration for application secrets.
# All secrets are stored as SecureString with KMS encryption.
# Values are set manually via the AWS Console or CLI — Terraform only
# manages the parameter definitions, not the secret values.

# Database connection string for Neon PostgreSQL
resource "aws_ssm_parameter" "database_url" {
  name        = "/laila-works/production/DATABASE_URL"
  description = "Neon PostgreSQL connection string"
  type        = "SecureString"
  value       = "placeholder"  # Set actual value via AWS CLI after creation
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
```

## Acceptance Criteria

- [ ] SSM parameters are defined for: DATABASE_URL, BETTER_AUTH_SECRET, GOOGLE_CLIENT_SECRET, API_KEY_ENCRYPTION_KEY
- [ ] All parameters use `SecureString` type
- [ ] A KMS key is created for encrypting SecureString parameters
- [ ] KMS key rotation is enabled
- [ ] Parameter names follow the path convention: `/laila-works/production/{PARAM_NAME}`
- [ ] `lifecycle.ignore_changes = [value]` prevents Terraform from overwriting manually-set secrets
- [ ] Placeholder values are used in Terraform; actual values are set via AWS CLI
- [ ] Data sources are defined for Lambda environment variable injection
- [ ] All resources are tagged
- [ ] `terraform validate` passes

## Technical Notes

- **Why placeholders?** Terraform state stores parameter values in plaintext. By using placeholder values and `ignore_changes`, actual secrets are set via `aws ssm put-parameter --overwrite` after Terraform creates the parameter definitions. This keeps real secrets out of the state file.
- **KMS encryption:** AWS-managed keys (`aws/ssm`) could be used instead of a custom KMS key, but a custom key provides better audit trail via CloudTrail and the ability to restrict access via key policies.
- **Key rotation:** The KMS key is configured with automatic annual rotation. This is a security best practice that rotates the encryption key without requiring re-encryption of existing parameters.
- **Neon DATABASE_URL format:** `postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/dbname?sslmode=require`

## References

- **AWS Documentation:** https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html
- **KMS Documentation:** https://docs.aws.amazon.com/kms/latest/developerguide/
- **Authentication:** Epic 4 (Authentication & Authorization) — Google OAuth, Better Auth

## Estimated Complexity

Low — Standard SSM parameter definitions with KMS key creation. The lifecycle ignore_changes pattern is well-established.
