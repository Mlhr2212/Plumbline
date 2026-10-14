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

variable "api_instance_type" {
  description = "EC2 instance type for the PlumbLine API host."
  type        = string
  default     = "t3.micro"
}

variable "api_ingress_cidr" {
  description = "CIDR allowed to reach the API on port 8000. Default is open for the portfolio demo — restrict to your IP/VPN for anything real."
  type        = string
  default     = "0.0.0.0/0"
}

variable "ssh_cidr" {
  description = "Optional CIDR allowed SSH access (empty = no SSH rule)."
  type        = string
  default     = ""
}

variable "ssh_key_name" {
  description = "Optional EC2 key pair name for SSH debugging."
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
