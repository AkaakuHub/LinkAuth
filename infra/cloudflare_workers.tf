resource "cloudflare_workers_domain" "auth" {
  account_id = var.cloudflare_account_id
  zone_id    = var.cloudflare_zone_id
  hostname   = "auth.${var.domain_name}"
  service    = var.auth_worker_service_name
}

resource "cloudflare_workers_domain" "account" {
  account_id = var.cloudflare_account_id
  zone_id    = var.cloudflare_zone_id
  hostname   = "account.${var.domain_name}"
  service    = var.account_worker_service_name
}

resource "cloudflare_workers_domain" "app" {
  account_id = var.cloudflare_account_id
  zone_id    = var.cloudflare_zone_id
  hostname   = "app.${var.domain_name}"
  service    = var.app_worker_service_name
}
