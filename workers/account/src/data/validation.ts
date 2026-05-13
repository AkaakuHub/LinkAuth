import { InvalidDataInputError } from "./errors.js";

export function requireDataString(value: string, name: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new InvalidDataInputError(`invalid ${name}`);
  }
  return value;
}

export function requireDataNumber(value: number, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new InvalidDataInputError(`invalid ${name}`);
  }
  return value;
}
