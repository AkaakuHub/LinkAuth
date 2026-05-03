variable "aws_region" {
  type    = string
  default = "ap-northeast-1"
}

variable "project_name" {
  type    = string
  default = "org-auth"
}

variable "domain_name" {
  type = string
}

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

variable "discord_public_key" {
  type      = string
  sensitive = true
}

variable "discord_guild_ids" {
  type = string
}

variable "internal_hmac_kid" {
  type    = string
  default = "2026-04"
}

variable "internal_hmac_secret" {
  type      = string
  sensitive = true
}

variable "discord_bot_token" {
  type      = string
  sensitive = true
}

variable "lambda_log_retention_days" {
  type    = number
  default = 7
}

variable "dynamodb_max_read_request_units" {
  type    = number
  default = 20
}

variable "dynamodb_max_write_request_units" {
  type    = number
  default = 2
}

variable "account_worker_service_name" {
  type    = string
  default = "org-auth-account"
}
