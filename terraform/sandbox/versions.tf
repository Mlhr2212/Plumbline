terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.4"
    }
  }

  # Remote state is strongly recommended once the scheduled GitHub Actions
  # scan runs against this sandbox — configure the bucket created by
  # terraform/plumbline, then uncomment:
  #
  # backend "s3" {
  #   bucket         = "plumbline-tfstate-<account_id>"
  #   key            = "sandbox/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "plumbline-tfstate-lock"
  # }
}
