resource "cloudflare_workers_cron_trigger" "account_cleanup" {
  account_id  = var.cloudflare_account_id
  script_name = var.account_worker_service_name
  schedules = [{
    cron = var.account_cleanup_cron
  }]
}
