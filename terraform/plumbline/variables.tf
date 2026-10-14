variable "aws_region" {
  description = "AWS region for PlumbLine platform resources."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Deployment environment label."
  type        = string
  default     = "dev"
}

variable "name_prefix" {
  description = "Prefix applied to PlumbLine resource names."
  type        = string
  default     = "plumbline"
}

variable "github_repository" {
  description = "GitHub repo in org/name form allowed to assume the drift-scan role via OIDC."
  type        = string
}

variable "github_oidc_provider_arn" {
  description = "Existing GitHub OIDC provider ARN. If empty, one is created."
  type        = string
  default     = ""
}

variable "tags" {
  description = "Common tags."
  type        = map(string)
  default = {
    Project   = "PlumbLine"
    ManagedBy = "terraform"
  }
}
