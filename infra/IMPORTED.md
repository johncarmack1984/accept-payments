# Imported / adopted resources

This root was reconciled against live AWS and now uses
the S3 backend `john-carmack-terraform-state` (key
`accept-payments/terraform.tfstate`, region us-west-2).

## Managed here

- `aws_iam_user.accept-payment-lambda-service-user` (pre-existing local state, migrated)
- `aws_iam_policy.accept-payment-lambda-service-policy` (pre-existing local state, migrated)
- `aws_iam_user_policy_attachment.accept-payment-lambda-service-user-policy-attachment` (pre-existing local state, migrated)
- `aws_iam_role.cargo-lambda-role` (`cargo-lambda-role-3689323a-85b1-46a2-bb67-44b20dd5ebf1`) — created by cargo-lambda deploys; adopted via import
- `aws_iam_role_policy_attachment.cargo-lambda-role-basic-execution` — created by cargo-lambda deploys; adopted via import

## Deliberately NOT managed here

- **The Lambda function `accept-payments` (us-west-1) is NOT imported.** It is
  deployed and owned by the GitHub Actions workflow
  (`.github/workflows/main.yml`) via `cargo lambda deploy`, which manages the
  function code, configuration, and function URL. Importing it here would make
  Terraform and the deploy pipeline fight over the same resource.

## Access key

- The `aws_iam_access_key` resource in `main.tf` is active. The key it
  originally created was deleted outside Terraform (access keys cannot be
  imported — the secret is unrecoverable), and a later apply minted the
  replacement Terraform now tracks. The secret is available via
  `terraform output -raw aws_secret_access_key`; make sure the GitHub
  Actions deploy secrets match the current key.
