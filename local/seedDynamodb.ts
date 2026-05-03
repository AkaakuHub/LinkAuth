import {
  CreateTableCommand,
  DescribeTableCommand,
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import { parseCommaSeparatedList } from "../shared/src/commaSeparated.js";
import { requiredLocalEnv } from "./env.js";

const endpoint = "http://localhost:8000";
const tableName = "org-auth-users";
const discordId = requiredLocalEnv("LOCAL_DISCORD_ID");
const discordGuildIds = parseCommaSeparatedList(
  "DISCORD_GUILD_IDS",
  requiredLocalEnv("DISCORD_GUILD_IDS"),
);
const discordGuildId = discordGuildIds[0];
if (!discordGuildId) {
  throw new Error("DISCORD_GUILD_IDS is required in .env.local");
}

const client = new DynamoDBClient({
  region: requiredLocalEnv("AWS_REGION"),
  endpoint,
  credentials: {
    accessKeyId: "local",
    secretAccessKey: "local",
  },
});
const documentClient = DynamoDBDocumentClient.from(client);

await ensureTable();
await seedUser();

console.log(`Seeded USER#${discordId} into ${tableName}`);

async function ensureTable(): Promise<void> {
  try {
    await client.send(new DescribeTableCommand({ TableName: tableName }));
    return;
  } catch {
    await client.send(
      new CreateTableCommand({
        TableName: tableName,
        BillingMode: "PAY_PER_REQUEST",
        AttributeDefinitions: [
          { AttributeName: "pk", AttributeType: "S" },
          { AttributeName: "sk", AttributeType: "S" },
        ],
        KeySchema: [
          { AttributeName: "pk", KeyType: "HASH" },
          { AttributeName: "sk", KeyType: "RANGE" },
        ],
      }),
    );
  }
}

async function seedUser(): Promise<void> {
  const now = new Date();
  await documentClient.send(
    new PutCommand({
      TableName: tableName,
      Item: {
        pk: `USER#${discordId}`,
        sk: "PROFILE",
        discord_id: discordId,
        discord_username: `local-${discordId}`,
        display_name: `Local ${discordId.slice(-4)}`,
        role: "user",
        status: "active",
        guild_id: discordGuildId,
        guild_member_status: "active",
        guild_checked_at: now.toISOString(),
        icon_source: "none",
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      },
    }),
  );
}
