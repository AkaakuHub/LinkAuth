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
  setQueryPageSize: (pageSize: number | null) => void;
} {
  const storage = new Map(items.map((item) => [itemKey(item), { ...item }]));
  let queryPageSize: number | null = null;
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
    const values = input.ExpressionAttributeValues as
      | Record<string, unknown>
      | undefined;
    if (
      input.ConditionExpression === "app_id = :app_id AND expires_at > :now" &&
      (value?.app_id !== values?.[":app_id"] ||
        typeof value?.expires_at !== "number" ||
        typeof values?.[":now"] !== "number" ||
        value.expires_at <= values[":now"])
    ) {
      throw new Error("ConditionalCheckFailed");
    }
    storage.delete(itemKey(key));
    return { Attributes: value };
  });
  dynamodbMock.on(UpdateCommand).callsFake((input) => {
    const key = input.Key as { pk: string; sk: string };
    const current = storage.get(itemKey(key)) ?? { ...key };
    const values = input.ExpressionAttributeValues as Record<string, unknown>;
    if (
      input.ConditionExpression === "token_hash = :old_token_hash" &&
      current.token_hash !== values[":old_token_hash"]
    ) {
      throw new Error("ConditionalCheckFailed");
    }
    const condition = input.ConditionExpression;
    if (typeof condition === "string" && condition.includes("_issued_at")) {
      const issuedAtKey = condition.includes("first_issued_at")
        ? "first_issued_at"
        : "second_issued_at";
      const cutoff = values[":cutoff"];
      if (
        typeof current[issuedAtKey] === "number" &&
        typeof cutoff === "number" &&
        current[issuedAtKey] > cutoff
      ) {
        throw new Error("ConditionalCheckFailed");
      }
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
    if (":now" in values) {
      if (input.UpdateExpression?.includes("first_issued_at = :now")) {
        current.first_issued_at = values[":now"];
      }
      if (input.UpdateExpression?.includes("second_issued_at = :now")) {
        current.second_issued_at = values[":now"];
      }
    }
    if (":challenge_id" in values) {
      if (input.UpdateExpression?.includes("first_challenge_id")) {
        current.first_challenge_id = values[":challenge_id"];
      }
      if (input.UpdateExpression?.includes("second_challenge_id")) {
        current.second_challenge_id = values[":challenge_id"];
      }
    }
    if (":updated_at" in values) {
      current.updated_at = values[":updated_at"];
    }
    storage.set(itemKey(key), current);
    return {};
  });
  dynamodbMock.on(QueryCommand).callsFake((input) => {
    const values = input.ExpressionAttributeValues as Record<string, string>;
    const startKey = input.ExclusiveStartKey as
      | { pk: string; sk: string }
      | undefined;
    const afterStartKey = (items: DynamoItem[]): DynamoItem[] => {
      if (!startKey) {
        return items;
      }
      const startIndex = items.findIndex(
        (item) => itemKey(item) === itemKey(startKey),
      );
      return startIndex >= 0 ? items.slice(startIndex + 1) : items;
    };
    const paginate = (items: DynamoItem[]) => {
      const pageItems = queryPageSize
        ? afterStartKey(items).slice(0, queryPageSize)
        : afterStartKey(items);
      const lastItem = pageItems.at(-1);
      return {
        Items: pageItems,
        LastEvaluatedKey:
          queryPageSize &&
          lastItem &&
          afterStartKey(items).length > pageItems.length
            ? { pk: lastItem.pk, sk: lastItem.sk }
            : undefined,
      };
    };
    if (input.IndexName === "gsi1") {
      return paginate(
        [...storage.values()].filter(
          (item) =>
            item.gsi1pk === values[":pk"] &&
            typeof item.gsi1sk === "string" &&
            item.gsi1sk.startsWith(values[":remember"] ?? ""),
        ),
      );
    }
    return paginate(
      [...storage.values()].filter(
        (item) =>
          item.pk === values[":pk"] &&
          item.sk.startsWith(values[":remember"] ?? ""),
      ),
    );
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
    setQueryPageSize(pageSize: number | null): void {
      queryPageSize = pageSize;
    },
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
