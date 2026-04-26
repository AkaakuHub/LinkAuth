export function requiredLambdaEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing ${name}`);
  }
  return value;
}

export function optionalLambdaEnv(name: string): string | undefined {
  const value = process.env[name];
  return value ? value : undefined;
}
