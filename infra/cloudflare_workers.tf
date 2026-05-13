resource "cloudflare_workers_custom_domain" "account" {
  account_id = var.cloudflare_account_id
  hostname   = local.account_worker_hostname
  service    = var.account_worker_service_name
  zone_id    = var.cloudflare_zone_id
}
