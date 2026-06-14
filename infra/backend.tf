terraform {
  required_providers {
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
  }
  backend "s3" {
    bucket       = "john-carmack-terraform-state"
    key          = "accept-payments/terraform.tfstate"
    region       = "us-west-2"
    use_lockfile = true
  }
}

# No provider block previously existed; the AWS profile in use has no default
# region, so one is required for the provider to initialize. All resources in
# this root are global IAM resources; the default region (us-west-1) matches
# the region where the accept-payments Lambda lives.
provider "aws" {
  region = var.aws_region
}
