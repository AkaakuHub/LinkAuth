export function requestOrigin(url: URL, domainName: string): string {
  return domainName === "localhost"
    ? url.origin
    : `https://account.${domainName}`;
}

export function assertSecret(name: string, value: string): void {
  if (value.length === 0) {
    throw new Error(`${name} is required`);
  }
}
