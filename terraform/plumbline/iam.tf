# IAM — GitHub OIDC scanner role + PlumbLine API runtime role.
# Both are least-privilege; detection is read-only, remediation is a
# separate boundary (and disabled by default in the application anyway).

locals {
  oidc_provider_arn = var.github_oidc_provider_arn != "" ? var.github_oidc_provider_arn : (
    length(aws_iam_openid_connect_provider.github) > 0
    ? aws_iam_openid_connect_provider.github[0].arn : ""
  )
}

resource "aws_iam_openid_connect_provider" "github" {
  count = var.github_oidc_provider_arn == "" ? 1 : 0

  url             = "https://token.actions.githubusercontent.com"
  client_id_list  = ["sts.amazonaws.com"]
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1"]

  tags = var.tags
}

# ---------------------------------------------------------------------------
# GitHub Actions drift-scan role (assumed via OIDC — no long-lived AWS keys).
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "scanner_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [local.oidc_provider_arn]
    }

    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repository}:*"]
    }
  }
}

resource "aws_iam_role" "drift_scanner" {
  name               = "${var.name_prefix}-drift-scanner"
  assume_role_policy = data.aws_iam_policy_document.scanner_trust.json
  tags               = var.tags
}

# Read-only permissions needed for `terraform plan` refresh of the sandbox
# resource set (EC2/SG/S3/IAM/Lambda). Detection never needs write APIs.
data "aws_iam_policy_document" "scanner_read" {
  statement {
    sid    = "TerraformRefreshRead"
    effect = "Allow"
    actions = [
      "ec2:Describe*",
      "s3:Get*", "s3:List*",
      "iam:Get*", "iam:List*",
      "lambda:Get*", "lambda:List*",
      "cloudtrail:LookupEvents",
      "sts:GetCallerIdentity",
    ]
    resources = ["*"]
  }

  # Terraform state access, scoped to the PlumbLine state bucket + lock table.
  statement {
    sid       = "TerraformStateObjects"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.tfstate.arn}/*"]
  }

  statement {
    sid       = "TerraformStateList"
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.tfstate.arn]
  }

  statement {
    sid    = "TerraformStateLock"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem",
    ]
    resources = [aws_dynamodb_table.tfstate_lock.arn]
  }
}

resource "aws_iam_role_policy" "scanner_read" {
  name   = "terraform-plan-read"
  role   = aws_iam_role.drift_scanner.id
  policy = data.aws_iam_policy_document.scanner_read.json
}

# ---------------------------------------------------------------------------
# PlumbLine API runtime role (EC2 instance profile or task role).
# Needs DynamoDB rw on PlumbLine tables, S3 read on plan artifacts, and
# CloudTrail read for attribution. Deliberately separate from the scanner role.
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "api_trust" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "api" {
  name               = "${var.name_prefix}-api"
  assume_role_policy = data.aws_iam_policy_document.api_trust.json
  tags               = var.tags
}

data "aws_iam_policy_document" "api_runtime" {
  statement {
    sid    = "PlumbLineTables"
    effect = "Allow"
    actions = [
      "dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem",
      "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan",
      "dynamodb:BatchWriteItem",
    ]
    resources = [
      aws_dynamodb_table.drifts.arn,
      aws_dynamodb_table.scans.arn,
      aws_dynamodb_table.timeline.arn,
      aws_dynamodb_table.reconciliations.arn,
      "${aws_dynamodb_table.drifts.arn}/index/*",
      "${aws_dynamodb_table.reconciliations.arn}/index/*",
    ]
  }

  statement {
    sid       = "PlanArtifactsRead"
    effect    = "Allow"
    actions   = ["s3:GetObject", "s3:HeadObject", "s3:ListBucket"]
    resources = [aws_s3_bucket.plan_artifacts.arn,
                 "${aws_s3_bucket.plan_artifacts.arn}/*"]
  }

  statement {
    sid       = "CloudTrailAttribution"
    effect    = "Allow"
    actions   = ["cloudtrail:LookupEvents"]
    resources = ["*"]
  }

  # Bootstrap secrets — read-only, scoped to the PlumbLine path.
  statement {
    sid       = "SSMSecretsRead"
    effect    = "Allow"
    actions   = ["ssm:GetParameter"]
    resources = ["arn:aws:ssm:${var.aws_region}:${data.aws_caller_identity.current.account_id}:parameter/plumbline/*"]
  }
}

resource "aws_iam_role_policy" "api_runtime" {
  name   = "plumbline-api-runtime"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api_runtime.json
}

resource "aws_iam_instance_profile" "api" {
  name = "${var.name_prefix}-api"
  role = aws_iam_role.api.name
}
