variable "aws_region" {
  type        = string
  default     = "us-west-1"
  description = "Region for the AWS provider and the accept-payments Lambda ARN."
}

variable "db_bucket_name" {
  type        = string
  default     = "accept-payments-db-johncarmack1984"
  description = "S3 bucket holding the SQLite database file. Must match DB_BUCKET in the deploy workflow."
}
