#!/usr/bin/env bash
# One-time script to create the S3 bucket and DynamoDB table
# for Terraform state management. Run this manually before
# the first `terraform init`.

set -euo pipefail

AWS_REGION="us-east-1"
STATE_BUCKET="laila-works-terraform-state"
LOCK_TABLE="laila-works-terraform-locks"

echo "Creating Terraform backend resources in ${AWS_REGION}..."

# Create S3 bucket for state storage
aws s3api create-bucket \
  --bucket "$STATE_BUCKET" \
  --region "$AWS_REGION"

# Enable versioning for state history
aws s3api put-bucket-versioning \
  --bucket "$STATE_BUCKET" \
  --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket "$STATE_BUCKET" \
  --server-side-encryption-configuration '{
    "Rules": [{"ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]
  }'

# Block public access
aws s3api put-public-access-block \
  --bucket "$STATE_BUCKET" \
  --public-access-block-configuration \
    BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true

# Create DynamoDB table for state locking
aws dynamodb create-table \
  --table-name "$LOCK_TABLE" \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region "$AWS_REGION"

echo "Terraform backend resources created successfully."
echo "Run 'terraform init' in infra/environments/production/"
