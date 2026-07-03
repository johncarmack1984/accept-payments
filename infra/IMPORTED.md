# Imported / adopted resources

This root was reconciled against live AWS and now uses
the S3 backend `john-carmack-terraform-state` (key
`accept-payments/terraform.tfstate`, region us-west-2).

## Managed here

- `aws_iam_role.cargo-lambda-role` (`cargo-lambda-role-3689323a-85b1-46a2-bb67-44b20dd5ebf1`) — created by cargo-lambda deploys; adopted via import
- `aws_iam_role_policy_attachment.cargo-lambda-role-basic-execution` — created by cargo-lambda deploys; adopted via import
- `aws_iam_role.github_deploy` + its inline policy — the GitHub Actions OIDC deploy role (see `oidc.tf`)

## Deliberately NOT managed here

- **The Lambda function `accept-payments` (us-west-1) is NOT imported.** It is
  deployed and owned by the GitHub Actions workflow
  (`.github/workflows/main.yml`) via `cargo lambda deploy`, which manages the
  function code, configuration, and function URL. Importing it here would make
  Terraform and the deploy pipeline fight over the same resource.

## Deploy credentials

- CI deploys assume `aws_iam_role.github_deploy` via GitHub OIDC — no static
  access keys. The role trusts only pushes to this repo's `main` branch (see
  `oidc.tf`), and the workflow reads its ARN from the `AWS_DEPLOY_ROLE_ARN`
  repo variable.
