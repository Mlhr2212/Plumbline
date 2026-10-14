# Third-Party Notices

PlumbLine uses third-party software exclusively as **normal package
dependencies or external executables**. No third-party source code is copied
into this repository.

## Runtime dependencies (installed via package managers)

| Project | Upstream | License | How PlumbLine uses it |
|---|---|---|---|
| FastAPI | github.com/fastapi/fastapi | MIT | REST API framework (`backend/`) |
| Uvicorn | github.com/encode/uvicorn | BSD-3-Clause | ASGI server |
| Pydantic / pydantic-settings | github.com/pydantic/pydantic | MIT | Domain models, settings validation |
| boto3 | github.com/boto/boto3 | Apache-2.0 | AWS SDK calls (DynamoDB, S3, CloudTrail) |
| httpx | github.com/encode/httpx | BSD-3-Clause | GitHub REST client, test client |

## Development dependencies

| Project | Upstream | License | How PlumbLine uses it |
|---|---|---|---|
| pytest | github.com/pytest-dev/pytest | MIT | Test runner |

## External executables (invoked via CLI, never vendored)

| Project | Upstream | License | How PlumbLine uses it |
|---|---|---|---|
| Terraform | github.com/hashicorp/terraform | BUSL-1.1 | Invoked as an external CLI (`terraform plan`, `terraform show -json`) by CI and the `IaCRunner` abstraction. No Terraform source code is copied, modified, or redistributed. |
| OpenTofu | github.com/opentofu/opentofu | MPL-2.0 | Alternative IaC engine behind the same `IaCRunner` interface (`PLUMBLINE_IAC_ENGINE=tofu`). Interface-compatible only; **untested** — not a claimed feature. |

## Architectural references (studied, not copied)

| Project | Upstream | License | How PlumbLine uses it |
|---|---|---|---|
| sample-terraform-drift-detection | github.com/aws-samples/sample-terraform-drift-detection | MIT-0 | Studied for scheduled-scan/IAM/reference-architecture ideas. No source code copied. |
| driftctl | github.com/snyk/driftctl | Apache-2.0 | Studied for drift-terminology and scan-model ideas. Not a dependency; no source code copied. |

## GitHub Actions used by `.github/workflows/`

| Action | License |
|---|---|
| actions/checkout | MIT |
| hashicorp/setup-terraform | MPL-2.0 |
| aws-actions/configure-aws-credentials | MIT |
| actions/upload-artifact | MIT |
