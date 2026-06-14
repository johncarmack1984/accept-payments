# The GitHub OAuth App itself is UI-only — GitHub has no API to create OAuth
# apps. Terraform owns the resulting non-secret client id as an Actions variable
# the deploy workflow reads. (GitHub rejects secret/variable names starting with
# GITHUB_, so it's stored as OAUTH_CLIENT_ID.) The client secret and the session
# signing key stay as `gh secret`s, out of Terraform state.
provider "github" {
  owner = "johncarmack1984"
}

variable "oauth_client_id" {
  type        = string
  description = "Client ID of the GitHub OAuth App used for admin sign-in (non-secret)."
}

resource "github_actions_variable" "oauth_client_id" {
  repository    = "accept-payments"
  variable_name = "OAUTH_CLIENT_ID"
  value         = var.oauth_client_id
}
