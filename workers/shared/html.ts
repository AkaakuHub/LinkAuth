import { createElement, type ReactNode } from "react";
import { renderToReadableStream } from "react-dom/server.browser";
import { styleSheet } from "./stylesGenerated.js";

export async function page(
  title: string,
  body: ReactNode,
  status = 200,
  headers?: Headers,
): Promise<Response> {
  const stream = await renderToReadableStream(
    createElement(
      "html",
      { lang: "ja" },
      createElement(
        "head",
        null,
        createElement("meta", { charSet: "utf-8" }),
        createElement("meta", {
          name: "viewport",
          content: "width=device-width, initial-scale=1",
        }),
        createElement("title", null, title),
        createElement("style", null, styleSheet),
      ),
      createElement(
        "body",
        null,
        createElement(
          "main",
          {
            className:
              "mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 py-8 sm:px-6 lg:px-8",
          },
          body,
        ),
      ),
    ),
  );
  return new Response(stream, {
    status,
    headers: responseHeaders(headers),
  });
}

function responseHeaders(headers?: Headers): Headers {
  const responseHeaders = headers ?? new Headers();
  responseHeaders.set("content-type", "text/html; charset=utf-8");
  return responseHeaders;
}
