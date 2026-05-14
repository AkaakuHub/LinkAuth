import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:https";
import type { AddressInfo } from "node:net";
import type { TestServer } from "./authFlowTypes.js";

const localhostCertificate = {
  key: `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCcixo8YHpBFw6p
cONWmugDL7ntXmTocXYjZcf0+X+3dNVCJJb3218245t+01B9fbhyZK1vpExuTFKr
ZCnD9pJQFASXplRnTa1RpBsKCamwTXw4B+wq8Ad27bnx2b8JyJEcrMhL+EntouWN
f8i6AbnLp2LOhkavNQthbIgN96uwY5FC4yHAgJqP4LqlF+JrEI9s0JzIaaVnDdYb
/76fU+K4ABVartQXCAUMA/T0LO7F1mDoLwV1VM8mB3qGef48crRFPckE9yZM5a/3
gb15f3mF42Hxi3ekv5rEBvKyX+2b1+E65+boh/opkamWU8GZvsQ2gX1bnxql7iM0
tPlqDyG3AgMBAAECggEABANDo4ywJoTAuwzzkyOiOKjOeXl/UYL6WOylozrzsii5
S60p9vEgsd8XKV8K3EYOzAnDz6nuGJIuR9kkGLM4QFYRJQK6UDW1li+ETtzqT9zt
jqRAK/UgPMy70CIKXW1sziIh1ETw5G57imAD4nE2aX+blJy/fCk2k/+gZAYXURug
IFhre9PNNURhIOlRoSWSI4oTfFiCRiHMLsBhk52cZ37R24+PXn2V+6FTemHl4NdM
mBpnBCNw+afv/xGu7BKZBARMBy+O+7sW6BfgM/qr2TAAdDxjogHE/TidofvZCHJV
zp2ciXk53w2HJSqINouiqvYMdNNWSYKecDxbAYBLoQKBgQDQiovs19ZGi1F1bgAR
rEr4FJoCl8P7vgmOuCvSlXbVKjR4OLdDmA4m1C/MlLD1SdawxbSKag4qqZY74thR
FGZb2RIe9SzE05xqpx3iLNEHd6eVeh8c2mLGeXN4mI8fMF/RUdfManxGcR0aSiyF
qmSZZkGJPGmIMHfQmHGnyx/XRwKBgQDAKzOVUp627IlZAgxXAdqheZR8gk8e1lYU
jXyeD+KyeTKy2Rby4pAX9R38Xmn/gMkMq6K12r0JzuM/KsQuBdWgESX3I/EPpJ/h
pLqL0iDTA0H5xQnlsowGWN73Xp77f8v6t+B/9a/nautkEP7yREyd/5GRrDK0VG02
2C6jXdZ6EQKBgHj4tby5Y+peLO3C1rVpzb9lLAXvBdhF4ANzYLBy1ZFIP1GyDNVg
Im1xzxyM8K4JnEnFFjro1Lj40VaB+9vkyo/jNvjQXpz66BSSRuqJ9uOvDH7QbbXu
FThvAYXmcbe09xBUuqsw5lByk2BJwNP1CRBXWhMDAXDoNMjDdcLROPJHAoGBAKKC
Zkb67ZmIAsawwrq5qKgxZu68TCip3XXYCPCqQm3nrIYurAeOrYh1E3yeY0ldIaiD
ZUAg0QiAWxDKG8lHydZpag/L50nxT/vEELW5Z2TLNnoAtVP4YA3mDfhnnk7VTiyi
X0oW/UDY3GNtNAyw0ZIz1Gi6lM6HLyzYOOiSrJPhAoGALvvoo/eLC3y+rQT5DoIj
XXbtBq3D7crcm86qWIx691noFnPqO7jH8kP1hen2mKZ+wJref3Rm0EDdVIj8s1AC
rvtdtOq1JarfWcRbpSPeHl2J3s23bdiFPwmrqKJil4ybDELLjq+KxkL/4LBOeHH7
UFEkUzbtWainl4LvsCox7dg=
-----END PRIVATE KEY-----`,
  cert: `-----BEGIN CERTIFICATE-----
MIIDJTCCAg2gAwIBAgIUHJ2PDLRKAaBqU1B99KNWNWx1d+wwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJbG9jYWxob3N0MB4XDTI2MDUxNDA4MTU0N1oXDTM2MDUx
MTA4MTU0N1owFDESMBAGA1UEAwwJbG9jYWxob3N0MIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEAnIsaPGB6QRcOqXDjVproAy+57V5k6HF2I2XH9Pl/t3TV
QiSW99tfNuObftNQfX24cmStb6RMbkxSq2Qpw/aSUBQEl6ZUZ02tUaQbCgmpsE18
OAfsKvAHdu258dm/CciRHKzIS/hJ7aLljX/IugG5y6dizoZGrzULYWyIDfersGOR
QuMhwICaj+C6pRfiaxCPbNCcyGmlZw3WG/++n1PiuAAVWq7UFwgFDAP09CzuxdZg
6C8FdVTPJgd6hnn+PHK0RT3JBPcmTOWv94G9eX95heNh8Yt3pL+axAbysl/tm9fh
Oufm6If6KZGpllPBmb7ENoF9W58ape4jNLT5ag8htwIDAQABo28wbTAdBgNVHQ4E
FgQUPgTp6UsxQ8oiZFtT708hD1tqiggwHwYDVR0jBBgwFoAUPgTp6UsxQ8oiZFtT
708hD1tqiggwDwYDVR0TAQH/BAUwAwEB/zAaBgNVHREEEzARgglsb2NhbGhvc3SH
BH8AAAEwDQYJKoZIhvcNAQELBQADggEBAFBp+MH+TssxwrvQGI0XyF0fFOxhwre4
ES3i/akqH6SkMgoGiR5sP/8W4QJFZvRoLp+AHagSDycBvYy+xndhh/bqLFV45aIa
HvMuDRZpGofTr3MlFl/TBlXiPQ4sFAENyW3YmK0jyRUFybMfjpWLJpvUfKNbeCSN
sDPz98nXRCj9f4Oh73VGq7MC753aG3U5+zpHFeCvY3wSz8ymISXfaY+9MRIM1oku
7y26Hn7W23dxwMm2EzPWX3b08WTSyEkI8VBUKbSA9vaoyz/gU28955mUZIO8s5qQ
4FNn0V37Orh1fxDAN2MPPld0Jp1bYYdXnyztodHLCibhzFsLLUKYt+c=
-----END CERTIFICATE-----`,
};

export async function startHttpServer(
  handler: (request: Request) => Promise<Response>,
): Promise<TestServer> {
  const server = createServer(
    localhostCertificate,
    async (incoming, outgoing) => {
      try {
        await sendResponse(
          outgoing,
          await handler(await nodeRequest(incoming)),
        );
      } catch (error) {
        outgoing.statusCode = 500;
        outgoing.end(error instanceof Error ? error.message : "internal error");
      }
    },
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `https://localhost:${port}`,
    async close() {
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function nodeRequest(incoming: IncomingMessage): Promise<Request> {
  const { port } = incoming.socket.localAddress
    ? (incoming.socket.address() as AddressInfo)
    : { port: 0 };
  const chunks: Buffer[] = [];
  for await (const chunk of incoming) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
    } else if (value !== undefined) {
      headers.set(name, value);
    }
  }
  const method = incoming.method ?? "GET";
  const init: RequestInit = {
    headers,
    method,
  };
  if (method !== "GET" && method !== "HEAD") {
    init.body = new Uint8Array(Buffer.concat(chunks));
  }
  return new Request(`https://localhost:${port}${incoming.url ?? "/"}`, init);
}

async function sendResponse(
  outgoing: ServerResponse,
  response: Response,
): Promise<void> {
  outgoing.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key !== "set-cookie") {
      outgoing.setHeader(key, value);
    }
  });
  const setCookie = getSetCookie(response.headers);
  if (setCookie.length > 0) {
    outgoing.setHeader("set-cookie", setCookie);
  }
  outgoing.end(Buffer.from(await response.arrayBuffer()));
}

function getSetCookie(headers: Headers): string[] {
  const withGetSetCookie = headers as Headers & {
    getSetCookie?: () => string[];
  };
  const values = withGetSetCookie.getSetCookie?.();
  if (values) {
    return values;
  }
  const value = headers.get("set-cookie");
  return value ? [value] : [];
}
