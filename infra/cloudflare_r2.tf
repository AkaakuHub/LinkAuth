resource "cloudflare_r2_bucket" "assets" {
  account_id = var.cloudflare_account_id
  name       = "${var.project_name}-assets"
  location   = "APAC"
}
