# Posts live in DynamoDB. PROVISIONED capacity stays inside the always-free
# tier (25 RCU/WCU per account, no expiry); on-demand billing mode is NOT
# free-tier eligible.
resource "aws_dynamodb_table" "posts" {
  name           = var.db_table_name
  billing_mode   = "PROVISIONED"
  read_capacity  = 5
  write_capacity = 5
  hash_key       = "id"

  attribute {
    name = "id"
    type = "N"
  }
}

resource "aws_iam_role_policy" "cargo-lambda-role-db-access" {
  name = "accept-payments-db-access"
  role = aws_iam_role.cargo-lambda-role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Scan",
        ]
        Resource = aws_dynamodb_table.posts.arn
      }
    ]
  })
}
