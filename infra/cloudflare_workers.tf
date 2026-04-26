resource "cloudflare_workers_domain" "account" {
  account_id = var.cloudflare_account_id
  zone_id    = var.cloudflare_zone_id
  hostname   = "account.${var.domain_name}"
  service    = var.account_worker_service_name
}
