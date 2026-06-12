variable "aws_region" {
  type        = string
  default     = "us-west-1"
  description = "Region for the AWS provider and the accept-payments Lambda ARN."
}

variable "db_bucket_name" {
  type        = string
  default     = "accept-payments-db-johncarmack1984"
  description = "S3 bucket that held the retired SQLite database file."
}

variable "db_table_name" {
  type        = string
  default     = "accept-payments-posts"
  description = "DynamoDB table holding posts. Must match DB_TABLE in the deploy workflow."
}
