export function parseCommaSeparatedList(name: string, value: string): string[] {
  const values = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (values.length === 0) {
    throw new Error(`${name} is required`);
  }
  return values;
}
