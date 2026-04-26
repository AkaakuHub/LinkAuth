import { createDynamoDbDocumentClient } from "../../shared/dynamodb.js";
import { optionalLambdaEnv, requiredLambdaEnv } from "../../shared/env.js";

export function loadUserApiConfig() {
  return {
    tableName: requiredLambdaEnv("DYNAMODB_TABLE"),
    discord: {
      guildId: requiredLambdaEnv("DISCORD_GUILD_ID"),
      botToken: requiredLambdaEnv("DISCORD_BOT_TOKEN"),
    },
    internalHmac: {
      kid: requiredLambdaEnv("INTERNAL_HMAC_KID"),
      secret: requiredLambdaEnv("INTERNAL_HMAC_SECRET"),
    },
    dynamodb: createDynamoDbDocumentClient({
      endpoint: optionalLambdaEnv("DYNAMODB_ENDPOINT"),
    }),
  };
}

export type UserApiConfig = ReturnType<typeof loadUserApiConfig>;
