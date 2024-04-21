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
          "lambda:GetFunction",
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
