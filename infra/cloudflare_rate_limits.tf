resource "cloudflare_ruleset" "account_rate_limits" {
  zone_id     = var.cloudflare_zone_id
  name        = "LinkAuth account rate limits"
  description = "Rate limits for LinkAuth account endpoints"
  kind        = "zone"
  phase       = "http_ratelimit"

  rules = [{
    ref         = "account_core_endpoints_per_ip"
    description = "Limit account asset, session, user, and token endpoints by IP"
    expression = join(" and ", [
      "http.host eq \"${local.account_worker_hostname}\"",
      "((http.request.uri.path contains \"/assets/icons/\" and http.request.uri.path contains \"/avatar.webp\") or http.request.uri.path in {\"/session/verify\" \"/me\" \"/token\"})",
    ])
    action  = "block"
    enabled = true

    ratelimit = {
      characteristics     = ["cf.colo.id", "ip.src"]
      period              = 10
      requests_per_period = 30
      mitigation_timeout  = 10
    }
  }]
}
