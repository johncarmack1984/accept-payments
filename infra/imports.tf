# Import blocks for live resources not yet under Terraform management.

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
