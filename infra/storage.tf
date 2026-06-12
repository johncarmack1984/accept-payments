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

# Transitional: the retired SQLite-on-S3 store, kept until the DynamoDB
# cutover is verified live, then deleted. force_destroy lets terraform empty
# the versioned bucket on the way out.
resource "aws_s3_bucket" "db" {
  bucket        = var.db_bucket_name
  force_destroy = true
}

resource "aws_s3_bucket_versioning" "db" {
  bucket = aws_s3_bucket.db.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_public_access_block" "db" {
  bucket                  = aws_s3_bucket.db.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
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
      # transitional S3 grants for the still-deployed SQLite code; removed
      # with the bucket after cutover
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject"]
        Resource = "${aws_s3_bucket.db.arn}/*"
      },
      {
        Effect   = "Allow"
        Action   = "s3:ListBucket"
        Resource = aws_s3_bucket.db.arn
      }
    ]
  })
}
