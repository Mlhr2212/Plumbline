output "security_group_id" {
  value = aws_security_group.web.id
}

output "instance_id" {
  value = aws_instance.app.id
}

output "bucket_name" {
  value = aws_s3_bucket.data.bucket
}

output "app_role_arn" {
  value = aws_iam_role.app.arn
}

output "lambda_function_name" {
  value = aws_lambda_function.worker.function_name
}
