# The GitHub OAuth App itself is UI-only — GitHub has no API to create OAuth
# apps — but Terraform can own the resulting non-secret client id as the
# GITHUB_CLIENT_ID Actions variable the deploy workflow reads. The client secret
# and the session signing key stay as `gh secret`s, out of Terraform state.
provider "github" {
  owner = "johncarmack1984"
}

variable "github_client_id" {
  type        = string
  description = "Client ID of the GitHub OAuth App used for admin sign-in (non-secret)."
}

resource "github_actions_variable" "github_client_id" {
  repository    = "accept-payments"
  variable_name = "GITHUB_CLIENT_ID"
  value         = var.github_client_id
}
