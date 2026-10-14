# PlumbLine sandbox — intentionally simple Terraform-managed AWS resources
# used to demonstrate REAL drift detection. Apply this, then modify resources
# out-of-band (console/CLI) and let the scheduled scan detect the drift.
#
# Classic demo: the security group below declares HTTPS-only ingress.
# Manually adding "TCP 22 from 0.0.0.0/0" in the console produces a
# resource_drift entry on aws_security_group.web that PlumbLine classifies
# and (optionally) attributes via CloudTrail.

provider "aws" {
  region = var.aws_region
}

data "aws_caller_identity" "current" {}

data "aws_ami" "al2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-*-x86_64"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_security_group" "web" {
  name        = "${var.name_prefix}-web"
  description = "PlumbLine sandbox: HTTPS ingress only"

  ingress {
    description = "HTTPS from the internal network"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["10.0.0.0/8"]
  }

  egress {
    description = "Permit outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, { Name = "${var.name_prefix}-web" })
}

resource "aws_instance" "app" {
  ami                    = data.aws_ami.al2023.id
  instance_type          = "t3.micro"
  vpc_security_group_ids = [aws_security_group.web.id]

  tags = merge(var.tags, { Name = "${var.name_prefix}-app" })
}

resource "aws_s3_bucket" "data" {
  bucket = "${var.name_prefix}-data-${data.aws_caller_identity.current.account_id}"

  tags = var.tags
}

resource "aws_iam_role" "app" {
  name = "${var.name_prefix}-app"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "ec2.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  inline_policy {
    name = "read-own-bucket"
    policy = jsonencode({
      Version = "2012-10-17"
      Statement = [{
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:ListBucket"]
        Resource = [aws_s3_bucket.data.arn, "${aws_s3_bucket.data.arn}/*"]
      }]
    })
  }

  tags = var.tags
}

data "archive_file" "worker" {
  type        = "zip"
  source_file = "${path.module}/files/handler.py"
  output_path = "${path.module}/files/handler.zip"
}

resource "aws_lambda_function" "worker" {
  function_name    = "${var.name_prefix}-worker"
  role             = aws_iam_role.lambda.arn
  handler          = "handler.handler"
  runtime          = "python3.12"
  filename         = data.archive_file.worker.output_path
  source_code_hash = data.archive_file.worker.output_base64sha256
  timeout          = 10

  tags = var.tags
}

resource "aws_iam_role" "lambda" {
  name = "${var.name_prefix}-lambda"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })

  tags = var.tags
}
