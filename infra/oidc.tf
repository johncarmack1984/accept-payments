# GitHub Actions deploys via OIDC — no static keys. The role can be assumed
# ONLY by pushes to this repo's main branch (sub pinned to refs/heads/main,
# never :*), and its policy is the empirically-minimal deploy set: update the
# one Lambda and pass its existing execution role. Unlike the old static
# deploy user, it cannot create or rewire IAM roles.
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

resource "aws_iam_role" "github_deploy" {
  name = "accept-payments-github-deploy"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = data.aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
            "token.actions.githubusercontent.com:sub" = "repo:johncarmack1984/accept-payments:ref:refs/heads/main"
          }
        }
      }
    ]
  })
}

resource "aws_iam_role_policy" "github_deploy" {
  name = "accept-payments-github-deploy-policy"
  role = aws_iam_role.github_deploy.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # The lambda action list is the proven set from the old deploy user —
        # cargo-lambda 1.9.x needs GetFunctionConfiguration (it polls after
        # updates) and GetPolicy in addition to the obvious update/read set;
        # trimming these has caused AccessDenied deploy failures before.
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
          "lambda:TagResource",
        ]
        Resource = [
          "arn:aws:lambda:${var.aws_region}:${local.account_id}:function:accept-payments",
        ]
      },
      {
        # Deploys pass the function's existing execution role; they never
        # create or modify roles (the old user's CreateRole/PutRolePolicy/
        # UpdateAssumeRolePolicy grants are gone on purpose).
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = [aws_iam_role.cargo-lambda-role.arn]
      },
      {
        # The deploy's drift gate reads live PITR status on the financial
        # tables and fails if it disagrees with storage.tf. Read-only.
        Effect   = "Allow"
        Action   = ["dynamodb:DescribeContinuousBackups"]
        Resource = [
          aws_dynamodb_table.payments.arn,
          aws_dynamodb_table.invoices.arn,
        ]
      }
    ]
  })
}

# The workflow reads the role ARN as a repo variable (non-secret), the same
# pattern as OAUTH_CLIENT_ID above.
resource "github_actions_variable" "aws_deploy_role_arn" {
  repository    = "accept-payments"
  variable_name = "AWS_DEPLOY_ROLE_ARN"
  value         = aws_iam_role.github_deploy.arn
}
