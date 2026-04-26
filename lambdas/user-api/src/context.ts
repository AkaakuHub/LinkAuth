import type { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export type UserProfile = {
  pk: string;
  sk: "PROFILE";
  discord_id: string;
  display_name: string;
  role: "user" | "admin";
  status: "active" | "disabled" | "deleted";
  guild_member_status?: "active" | "left";
  guild_checked_at?: string;
  [key: string]: unknown;
};

export type UserApiContext = {
  tableName: string;
  discordGuildId: string;
  discordBotToken: string;
  dynamodb: DynamoDBDocumentClient;
};
