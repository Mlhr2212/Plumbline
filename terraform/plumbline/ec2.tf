# PlumbLine API host — Ubuntu EC2 with the api instance profile.
#
# Secrets are NOT stored in user_data or tfstate: the bootstrap script pulls
# them from SSM SecureString parameters at boot. Create them BEFORE applying
# (see README / scripts):
#   aws ssm put-parameter --name /plumbline/ingest_hmac_secret \
#       --type SecureString --value "$(openssl rand -hex 32)"
#   aws ssm put-parameter --name /plumbline/api_key \
#       --type SecureString --value "$(openssl rand -hex 32)"

data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_security_group" "api" {
  name        = "${var.name_prefix}-api"
  description = "PlumbLine API ingress"

  ingress {
    description = "PlumbLine API"
    from_port   = 8000
    to_port     = 8000
    protocol    = "tcp"
    cidr_blocks = [var.api_ingress_cidr]
  }

  dynamic "ingress" {
    for_each = var.ssh_cidr != "" ? [var.ssh_cidr] : []
    content {
      description = "SSH (restricted)"
      from_port   = 22
      to_port     = 22
      protocol    = "tcp"
      cidr_blocks = [ingress.value]
    }
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = var.tags
}

# Package the backend source (no venv/cache/tests) and ship it to S3 so the
# private repo never needs a GitHub token on the instance.
data "archive_file" "backend" {
  type        = "zip"
  source_dir  = "${path.module}/../../backend"
  output_path = "${path.module}/.build/backend.zip"
  excludes = [
    ".venv/**", ".env", "__pycache__/**", ".pytest_cache/**",
    "tests/**", "*.egg-info/**",
  ]
}

resource "aws_s3_object" "backend_code" {
  bucket = aws_s3_bucket.plan_artifacts.id
  key    = "code/backend-${data.archive_file.backend.output_sha}.zip"
  source = data.archive_file.backend.output_path
  etag   = filemd5(data.archive_file.backend.output_path)
  tags   = var.tags
}

resource "aws_instance" "api" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.api_instance_type
  iam_instance_profile   = aws_iam_instance_profile.api.name
  vpc_security_group_ids = [aws_security_group.api.id]
  key_name               = var.ssh_key_name != "" ? var.ssh_key_name : null

  depends_on = [aws_s3_object.backend_code]

  user_data = templatefile("${path.module}/user_data.sh.tftpl", {
    region         = var.aws_region
    code_bucket    = aws_s3_bucket.plan_artifacts.id
    code_key       = aws_s3_object.backend_code.key
    environment    = var.environment
    drifts_table   = aws_dynamodb_table.drifts.name
    scans_table    = aws_dynamodb_table.scans.name
    timeline_table = aws_dynamodb_table.timeline.name
    recon_table    = aws_dynamodb_table.reconciliations.name
  })

  tags = merge(var.tags, { Name = "${var.name_prefix}-api" })
}
