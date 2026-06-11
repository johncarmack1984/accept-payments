# SQLite database stored as a single S3 object. The Lambda keeps a working
# copy in /tmp and uploads it back after writes; versioning doubles as
# point-in-time recovery if the file is ever clobbered.
resource "aws_s3_bucket" "db" {
  bucket = var.db_bucket_name
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

# ListBucket is required so a HEAD on the missing object returns 404 instead
# of 403 — the app bootstraps a fresh database off that distinction.
resource "aws_iam_role_policy" "cargo-lambda-role-db-access" {
  name = "accept-payments-db-access"
  role = aws_iam_role.cargo-lambda-role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
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
