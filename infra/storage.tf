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

# Completed Stripe checkouts, keyed by webhook event id so delivery retries
# can be deduplicated with a conditional write.
resource "aws_dynamodb_table" "payments" {
  name           = var.payments_table_name
  billing_mode   = "PROVISIONED"
  read_capacity  = 5
  write_capacity = 5
  hash_key       = "event_id"

  attribute {
    name = "event_id"
    type = "S"
  }
}

# Invoices we issue and track (paid by ACH/wire directly, not Stripe). Stored as
# a JSON blob keyed by an opaque token id; the item id "counter" hands out the
# sequential invoice numbers.
resource "aws_dynamodb_table" "invoices" {
  name           = var.invoices_table_name
  billing_mode   = "PROVISIONED"
  read_capacity  = 5
  write_capacity = 5
  hash_key       = "id"

  attribute {
    name = "id"
    type = "S"
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
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:Scan",
        ]
        Resource = aws_dynamodb_table.payments.arn
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:Scan",
        ]
        Resource = aws_dynamodb_table.invoices.arn
      }
    ]
  })
}
