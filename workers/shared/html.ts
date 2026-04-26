export function page(title: string, body: string): Response {
  return new Response(
    `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
:root{color-scheme:light;--ink:#161616;--muted:#666;--line:#d9d4ca;--paper:#f7f3ea;--panel:#fffaf0;--accent:#0c6b5a;--danger:#a6332b}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:Georgia,"Yu Mincho","Hiragino Mincho ProN",serif;line-height:1.65}
main{width:min(880px,calc(100% - 32px));margin:48px auto}
h1{font-size:32px;margin:0 0 24px;letter-spacing:0}
.panel{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:24px}
.grid{display:grid;grid-template-columns:180px 1fr;gap:12px 20px}
.label{color:var(--muted)}
input{width:100%;font:inherit;padding:10px 12px;border:1px solid var(--line);border-radius:6px;background:white}
button,.button{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 16px;border-radius:6px;border:1px solid var(--accent);background:var(--accent);color:white;text-decoration:none;font:inherit;cursor:pointer}
.danger{border-color:var(--danger);background:var(--danger)}
.actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:20px}
form{margin:0}
@media (max-width:640px){main{margin:24px auto}.grid{grid-template-columns:1fr}.panel{padding:18px}}
</style>
</head>
<body><main>${body}</main></body>
</html>`,
    {
      headers: { "content-type": "text/html; charset=utf-8" },
    },
  );
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
