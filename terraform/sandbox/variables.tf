variable "aws_region" {
  description = "AWS region for the PlumbLine sandbox."
  type        = string
  default     = "us-east-2"
}

variable "environment" {
  description = "Environment label (must match the scan's environment field)."
  type        = string
  default     = "dev"
}

variable "name_prefix" {
  description = "Prefix applied to sandbox resource names."
  type        = string
  default     = "plumbline-sandbox"
}

variable "tags" {
  description = "Common tags applied to all sandbox resources."
  type        = map(string)
  default = {
    Project     = "PlumbLine"
    ManagedBy   = "terraform"
    Environment = "dev"
  }
}
