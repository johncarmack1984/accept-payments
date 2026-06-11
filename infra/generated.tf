# __generated__ by Terraform
# Please review these resources and move them into your main configuration files.

# created by cargo-lambda deploys; adopted
# __generated__ by Terraform from "cargo-lambda-role-3689323a-85b1-46a2-bb67-44b20dd5ebf1/arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
resource "aws_iam_role_policy_attachment" "cargo-lambda-role-basic-execution" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
  role       = "cargo-lambda-role-3689323a-85b1-46a2-bb67-44b20dd5ebf1"
}

# created by cargo-lambda deploys; adopted
# __generated__ by Terraform from "cargo-lambda-role-3689323a-85b1-46a2-bb67-44b20dd5ebf1"
resource "aws_iam_role" "cargo-lambda-role" {
  assume_role_policy = jsonencode({
    Statement = [{
      Action = "sts:AssumeRole"
      Effect = "Allow"
      Principal = {
        Service = "lambda.amazonaws.com"
      }
    }]
    Version = "2012-10-17"
  })
  description           = null
  force_detach_policies = false
  # managed_policy_arns intentionally omitted (deprecated, and the attachment
  # is managed by aws_iam_role_policy_attachment.cargo-lambda-role-basic-execution)
  max_session_duration = 3600
  name                 = "cargo-lambda-role-3689323a-85b1-46a2-bb67-44b20dd5ebf1"
  path                 = "/"
  permissions_boundary = null
  tags                 = {}
}
