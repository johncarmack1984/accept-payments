variable "aws_region" {
  type        = string
  default     = "us-west-1"
  description = "Region for the AWS provider and the accept-payments Lambda ARN."
}

variable "db_table_name" {
  type        = string
  default     = "accept-payments-posts"
  description = "DynamoDB table holding posts. Must match DB_TABLE in the deploy workflow."
}
