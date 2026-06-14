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

variable "payments_table_name" {
  type        = string
  default     = "accept-payments-payments"
  description = "DynamoDB table holding completed Stripe payments. Must match PAYMENTS_TABLE in the deploy workflow."
}

variable "invoices_table_name" {
  type        = string
  default     = "accept-payments-invoices"
  description = "DynamoDB table holding issued invoices. Must match INVOICES_TABLE in the deploy workflow."
}
