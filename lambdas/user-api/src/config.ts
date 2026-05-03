import { parseCommaSeparatedList } from "../../../shared/src/commaSeparated.js";
import { createDynamoDbDocumentClient } from "../../shared/dynamodb.js";
import { optionalLambdaEnv, requiredLambdaEnv } from "../../shared/env.js";

export function loadUserApiConfig() {
  return {
    tableName: requiredLambdaEnv("DYNAMODB_TABLE"),
    discord: {
      guildIds: parseCommaSeparatedList(
        "DISCORD_GUILD_IDS",
        requiredLambdaEnv("DISCORD_GUILD_IDS"),
      ),
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
