import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from "@aws-sdk/lib-dynamodb";
import type { APIGatewayProxyStructuredResultV2 } from "aws-lambda";
import { mockClient } from "aws-sdk-client-mock";
import type { UserApiContext } from "../../lambdas/user-api/src/context.js";

type DynamoItem = Record<string, unknown> & { pk: string; sk: string };

export function createUserApiContext(items: DynamoItem[] = []): {
  context: UserApiContext;
  items: Map<string, DynamoItem>;
} {
  const storage = new Map(items.map((item) => [itemKey(item), { ...item }]));
  const dynamodbMock = mockClient(DynamoDBDocumentClient);
  dynamodbMock.reset();
  dynamodbMock.on(PutCommand).callsFake((input) => {
    const item = input.Item as DynamoItem;
    const key = itemKey(item);
    if (storage.has(key)) {
      throw new Error("ConditionalCheckFailed");
    }
    storage.set(key, { ...item });
    return {};
  });
  dynamodbMock.on(GetCommand).callsFake((input) => {
    const key = input.Key as { pk: string; sk: string };
    return { Item: storage.get(itemKey(key)) };
  });
  dynamodbMock.on(DeleteCommand).callsFake((input) => {
    const key = input.Key as { pk: string; sk: string };
    const value = storage.get(itemKey(key));
    storage.delete(itemKey(key));
    return { Attributes: value };
  });
  dynamodbMock.on(UpdateCommand).callsFake((input) => {
    const key = input.Key as { pk: string; sk: string };
    const current = storage.get(itemKey(key));
    if (!current) {
      return {};
    }
    const values = input.ExpressionAttributeValues as Record<string, unknown>;
    if (
      input.ConditionExpression === "token_hash = :old_token_hash" &&
      current.token_hash !== values[":old_token_hash"]
    ) {
      throw new Error("ConditionalCheckFailed");
    }
    if (":token_hash" in values) {
      current.token_hash = values[":token_hash"];
    }
    if (":last_used_at" in values) {
      current.last_used_at = values[":last_used_at"];
    }
    if (":expires_at" in values) {
      current.expires_at = values[":expires_at"];
    }
    return {};
  });
  dynamodbMock.on(QueryCommand).callsFake((input) => {
    const values = input.ExpressionAttributeValues as Record<string, string>;
    return {
      Items: [...storage.values()].filter(
        (item) =>
          item.pk === values[":pk"] &&
          item.sk.startsWith(values[":remember"] ?? ""),
      ),
    };
  });

  return {
    context: {
      tableName: "test-table",
      discordGuildIds: [],
      discordBotToken: "discord-bot-token",
      otpHashSecret: "otp-hash-secret",
      dynamodb: DynamoDBDocumentClient.from(
        new DynamoDBClient({
          credentials: {
            accessKeyId: "test",
            secretAccessKey: "test",
          },
          region: "us-east-1",
        }),
      ),
    },
    items: storage,
  };
}

export function parseJsonResponse(
  response: APIGatewayProxyStructuredResultV2,
): unknown {
  return response.body ? JSON.parse(response.body) : null;
}

function itemKey(item: { pk: string; sk: string }): string {
  return `${item.pk}\n${item.sk}`;
}
