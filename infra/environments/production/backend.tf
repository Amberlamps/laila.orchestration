# Terraform backend configuration for production state management.
# Uses S3 for state storage and DynamoDB for state locking to prevent
# concurrent modifications.

terraform {
  backend "s3" {
    bucket         = "laila-works-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "laila-works-terraform-locks"
  }
}
