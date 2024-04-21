resource "aws_iam_user" "accept-payment-lambda-service-user" {
  name = "accept-payment-lambda-service-user"
}

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
          "arn:aws:iam::735853783919:role/AWSLambdaBasicExecutionRole",
          "arn:aws:iam::735853783919:role/cargo-lambda-role-*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "lambda:AddPermission",
          "lambda:CreateFunctionUrlConfig",
          "lambda:GetFunction",
          "lambda:GetFunctionUrlConfig",
          "lambda:GetLayerVersion",
          "lambda:CreateFunction",
          "lambda:UpdateFunctionCode",
          "lambda:UpdateFunctionConfiguration",
          "lambda:PublishVersion",
          "lambda:TagResource"
        ]
        Resource = [
          "arn:aws:lambda:us-west-1:735853783919:function:accept-payments",
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
