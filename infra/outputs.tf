output "discord_interactions_function_url" {
  value = aws_lambda_function_url.discord_interactions.function_url
}

output "user_api_function_url" {
  value = aws_lambda_function_url.user_api.function_url
}

output "dynamodb_table_name" {
  value = aws_dynamodb_table.users.name
}

output "r2_bucket_name" {
  value = cloudflare_r2_bucket.assets.name
}

output "cloudflare_tunnel_id" {
  value = cloudflare_zero_trust_tunnel_cloudflared.api.id
}
