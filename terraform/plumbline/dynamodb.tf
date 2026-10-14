# DynamoDB persistence for PlumbLine (see backend/app/repositories/dynamodb.py).

resource "aws_dynamodb_table" "drifts" {
  name         = "${var.name_prefix}-drifts"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }
  attribute {
    name = "fingerprint"
    type = "S"
  }

  global_secondary_index {
    name            = "fingerprint-index"
    hash_key        = "fingerprint"
    projection_type = "ALL"
  }

  tags = var.tags
}

resource "aws_dynamodb_table" "scans" {
  name         = "${var.name_prefix}-scans"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }

  tags = var.tags
}

resource "aws_dynamodb_table" "timeline" {
  name         = "${var.name_prefix}-timeline"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "drift_id"
  range_key    = "sort_key"

  attribute {
    name = "drift_id"
    type = "S"
  }
  attribute {
    name = "sort_key"
    type = "S"
  }

  tags = var.tags
}

resource "aws_dynamodb_table" "reconciliations" {
  name         = "${var.name_prefix}-reconciliations"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }
  attribute {
    name = "drift_event_id"
    type = "S"
  }

  global_secondary_index {
    name            = "drift-index"
    hash_key        = "drift_event_id"
    projection_type = "ALL"
  }

  tags = var.tags
}
