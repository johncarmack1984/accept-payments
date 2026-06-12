data "aws_caller_identity" "current" {}

locals {
  account_id = data.aws_caller_identity.current.account_id
}

resource "aws_iam_user" "accept-payment-lambda-service-user" {
  name = "accept-payment-lambda-service-user"
}

# access key cannot be imported; rotate via Terraform if desired
# (the user's original key was deleted outside Terraform; the key this
# resource now tracks was created by a later apply and is live — keep the
# GitHub Actions secrets in sync with it)
resource "aws_iam_access_key" "accept-payment-lambda-service-user" {
  user = aws_iam_user.accept-payment-lambda-service-user.name
}

resource "aws_iam_policy" "accept-payment-lambda-service-policy" {
  name = "accept-payment-lambda-service-policy"
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [

          "iam:CreateRole",
          "iam:AttachRolePolicy",
          "iam:PassRole",
          "iam:PutRolePolicy",
          "iam:UpdateAssumeRolePolicy",
        ]
        Resource = [
          "arn:aws:iam::${local.account_id}:role/AWSLambdaBasicExecutionRole",
          "arn:aws:iam::${local.account_id}:role/cargo-lambda-role-*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "lambda:AddPermission",
          "lambda:CreateFunctionUrlConfig",
          "lambda:GetFunction",
          "lambda:GetFunctionConfiguration",
          "lambda:GetFunctionUrlConfig",
          "lambda:GetPolicy",
          "lambda:GetLayerVersion",
          "lambda:CreateFunction",
          "lambda:UpdateFunctionCode",
          "lambda:UpdateFunctionConfiguration",
          "lambda:PublishVersion",
          "lambda:PutFunctionConcurrency",
          "lambda:TagResource"
        ]
        Resource = [
          "arn:aws:lambda:${var.aws_region}:${local.account_id}:function:accept-payments",
        ]
      }
    ]
  })
}

resource "aws_iam_user_policy_attachment" "accept-payment-lambda-service-user-policy-attachment" {
  user       = aws_iam_user.accept-payment-lambda-service-user.name
  policy_arn = aws_iam_policy.accept-payment-lambda-service-policy.arn
}

output "aws_access_key_id" {
  value = aws_iam_access_key.accept-payment-lambda-service-user.id
}

output "aws_secret_access_key" {
  value     = aws_iam_access_key.accept-payment-lambda-service-user.secret
  sensitive = true
}
