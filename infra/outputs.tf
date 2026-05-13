output "account_worker_hostname" {
  value = cloudflare_workers_custom_domain.account.hostname
}

output "account_worker_service_name" {
  value = var.account_worker_service_name
}

output "d1_database_id" {
  value = cloudflare_d1_database.auth.id
}

output "d1_database_name" {
  value = cloudflare_d1_database.auth.name
}

output "r2_bucket_name" {
  value = cloudflare_r2_bucket.assets.name
}
