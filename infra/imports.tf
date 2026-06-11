# Import blocks for live resources not yet under Terraform management.
#
# Note: aws_iam_user.accept-payment-lambda-service-user,
# aws_iam_policy.accept-payment-lambda-service-policy, and
# aws_iam_user_policy_attachment.accept-payment-lambda-service-user-policy-attachment
# were already tracked in the pre-existing local terraform.tfstate (migrated to
# the S3 backend), so they need no import blocks here.

# created by cargo-lambda deploys; adopted
import {
  to = aws_iam_role.cargo-lambda-role
  id = "cargo-lambda-role-3689323a-85b1-46a2-bb67-44b20dd5ebf1"
}

# created by cargo-lambda deploys; adopted
import {
  to = aws_iam_role_policy_attachment.cargo-lambda-role-basic-execution
  id = "cargo-lambda-role-3689323a-85b1-46a2-bb67-44b20dd5ebf1/arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}
