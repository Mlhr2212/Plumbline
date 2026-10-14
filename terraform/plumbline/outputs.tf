output "drift_scanner_role_arn" {
  description = "Set as AWS_DRIFT_SCAN_ROLE_ARN (GitHub Actions variable/secret)."
  value       = aws_iam_role.drift_scanner.arn
}

output "api_role_arn" {
  value = aws_iam_role.api.arn
}

output "api_instance_profile" {
  value = aws_iam_instance_profile.api.name
}

output "plan_artifacts_bucket" {
  value = aws_s3_bucket.plan_artifacts.bucket
}

output "tfstate_bucket" {
  value = aws_s3_bucket.tfstate.bucket
}

output "dynamodb_tables" {
  value = {
    drifts          = aws_dynamodb_table.drifts.name
    scans           = aws_dynamodb_table.scans.name
    timeline        = aws_dynamodb_table.timeline.name
    reconciliations = aws_dynamodb_table.reconciliations.name
  }
}
