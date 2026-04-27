import {
  DynamoDBClient,
  type DynamoDBClientConfig,
} from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

type DynamoDbConfig = {
  endpoint: string | undefined;
};

export function createDynamoDbDocumentClient(
  dynamodbConfig: DynamoDbConfig,
): DynamoDBDocumentClient {
  const clientConfig: DynamoDBClientConfig = {};
  if (dynamodbConfig.endpoint) {
    clientConfig.endpoint = dynamodbConfig.endpoint;
  }
  return DynamoDBDocumentClient.from(new DynamoDBClient(clientConfig));
}
