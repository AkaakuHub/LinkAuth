data "archive_file" "discord_interactions" {
  type        = "zip"
  source_file = "${path.module}/../dist/lambdas/discord-interactions/index.js"
  output_path = "${path.module}/../dist/discord-interactions.zip"
}

data "archive_file" "user_api" {
  type        = "zip"
  source_file = "${path.module}/../dist/lambdas/user-api/index.js"
  output_path = "${path.module}/../dist/user-api.zip"
}

resource "aws_cloudwatch_log_group" "discord_interactions" {
  name              = "/aws/lambda/${var.project_name}-discord-interactions"
  retention_in_days = var.lambda_log_retention_days
}

resource "aws_cloudwatch_log_group" "user_api" {
  name              = "/aws/lambda/${var.project_name}-user-api"
  retention_in_days = var.lambda_log_retention_days
}

resource "aws_lambda_function" "discord_interactions" {
  function_name    = "${var.project_name}-discord-interactions"
  role             = aws_iam_role.lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.discord_interactions.output_path
  source_code_hash = data.archive_file.discord_interactions.output_base64sha256

  environment {
    variables = {
      DYNAMODB_TABLE     = aws_dynamodb_table.users.name
      ACCOUNT_URL        = "https://account.${var.domain_name}/"
      DISCORD_GUILD_IDS  = var.discord_guild_ids
      DISCORD_PUBLIC_KEY = var.discord_public_key
    }
  }

  depends_on = [aws_cloudwatch_log_group.discord_interactions]
}

resource "aws_lambda_function" "user_api" {
  function_name    = "${var.project_name}-user-api"
  role             = aws_iam_role.lambda.arn
  handler          = "index.handler"
  runtime          = "nodejs20.x"
  filename         = data.archive_file.user_api.output_path
  source_code_hash = data.archive_file.user_api.output_base64sha256

  environment {
    variables = {
      DYNAMODB_TABLE       = aws_dynamodb_table.users.name
      DISCORD_BOT_TOKEN    = var.discord_bot_token
      DISCORD_GUILD_IDS    = var.discord_guild_ids
      INTERNAL_HMAC_KID    = var.internal_hmac_kid
      INTERNAL_HMAC_SECRET = var.internal_hmac_secret
    }
  }

  depends_on = [aws_cloudwatch_log_group.user_api]
}

resource "aws_lambda_function_url" "discord_interactions" {
  function_name      = aws_lambda_function.discord_interactions.function_name
  authorization_type = "NONE"
}

resource "aws_lambda_function_url" "user_api" {
  function_name      = aws_lambda_function.user_api.function_name
  authorization_type = "NONE"
}
