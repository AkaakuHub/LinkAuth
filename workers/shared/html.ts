import { styleSheet } from "./stylesGenerated.js";

export function page(
  title: string,
  body: string,
  status = 200,
  headers?: Headers,
): Response {
  return new Response(
    `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>${styleSheet}</style></head><body><main class="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-8 sm:px-6 lg:px-8">${body}</main></body></html>`,
    {
      status,
      headers: responseHeaders(headers),
    },
  );
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

export function attr(name: string, value: string | number | boolean): string {
  if (value === false) {
    return "";
  }
  if (value === true) {
    return ` ${name}`;
  }
  return ` ${name}="${escapeHtml(String(value))}"`;
}

function responseHeaders(headers?: Headers): Headers {
  const responseHeaders = headers ?? new Headers();
  responseHeaders.set("content-type", "text/html; charset=utf-8");
  return responseHeaders;
}
