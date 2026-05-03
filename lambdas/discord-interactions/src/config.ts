import { parseCommaSeparatedList } from "../../../shared/src/commaSeparated.js";
import { createDynamoDbDocumentClient } from "../../shared/dynamodb.js";
import { optionalLambdaEnv, requiredLambdaEnv } from "../../shared/env.js";

export function loadDiscordInteractionsConfig() {
  return {
    tableName: requiredLambdaEnv("DYNAMODB_TABLE"),
    accountUrl: requiredLambdaEnv("ACCOUNT_URL"),
    discord: {
      guildIds: parseCommaSeparatedList(
        "DISCORD_GUILD_IDS",
        requiredLambdaEnv("DISCORD_GUILD_IDS"),
      ),
      publicKey: requiredLambdaEnv("DISCORD_PUBLIC_KEY"),
    },
    dynamodb: createDynamoDbDocumentClient({
      endpoint: optionalLambdaEnv("DYNAMODB_ENDPOINT"),
    }),
  };
}
