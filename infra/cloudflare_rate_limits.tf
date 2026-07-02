resource "cloudflare_ruleset" "account_rate_limits" {
  zone_id     = var.cloudflare_zone_id
  name        = "LinkAuth account rate limits"
  description = "Rate limits for LinkAuth account endpoints"
  kind        = "zone"
  phase       = "http_ratelimit"

  rules = [{
    ref         = "account_core_endpoints_per_ip"
    description = "Limit LinkAuth account endpoints and Rabuca Util official-service endpoints by IP"
    expression = join(" or ", [
      join(" and ", [
        "http.host eq \"${local.account_worker_hostname}\"",
        "(http.request.uri.path contains \"/assets/icons/\" or http.request.uri.path in {\"/session/verify\" \"/me\" \"/token\"})",
      ]),
      join(" and ", [
        "http.host eq \"rabuca.akaaku.net\"",
        "http.request.uri.path in {\"/login\" \"/_auth/callback\" \"/_auth/logout\" \"/_auth/account\" \"/api/deck-recipes\" \"/api/deck-validation\"}",
      ]),
      join(" and ", [
        "http.host eq \"rabuca.akaaku.net\"",
        "starts_with(http.request.uri.path, \"/api/deck-recipes/\")",
        "not starts_with(http.request.uri.path, \"/api/deck-recipes/thumb/\")",
      ]),
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
