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

  # Remote state in the PlumbLine-created bucket — required so every GitHub
  # Actions runner sees the same sandbox state (local state would make each
  # scheduled scan plan "create everything" and hide real drift).
  backend "s3" {
    bucket         = "plumbline-tfstate-376634957118"
    key            = "sandbox/terraform.tfstate"
    region         = "us-east-2"
    encrypt        = true
    dynamodb_table = "plumbline-tfstate-lock"
  }
}
