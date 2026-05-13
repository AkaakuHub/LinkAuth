variable "cloudflare_api_token" {
  type      = string
  sensitive = true
}

variable "cloudflare_account_id" {
  type = string
}

variable "cloudflare_zone_id" {
  type = string
}

variable "project_name" {
  type    = string
  default = "org-auth"
}

variable "domain_name" {
  type = string
}

variable "account_worker_service_name" {
  type    = string
  default = "org-auth-account"
}

variable "account_worker_hostname" {
  type    = string
  default = null
}

variable "r2_bucket_location" {
  type    = string
  default = "apac"
}

locals {
  account_worker_hostname = coalesce(var.account_worker_hostname, "account.${var.domain_name}")
  d1_database_name        = var.project_name
  r2_bucket_name          = "${var.project_name}-assets"
}
