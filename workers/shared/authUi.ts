import { escapeHtml } from "./html.js";
import { type IconName, icon } from "./icons.js";
import { cn } from "./ui.js";

type AuthPanelTone = "primary" | "danger";

export function authShell(children: string): string {
  return `<div class="auth-shell grid flex-1 place-items-center py-8 sm:py-12">${children}</div>`;
}

export function authPanel({
  children,
  description,
  iconName,
  label,
  title,
  tone = "primary",
}: {
  children: string;
  description: string;
  iconName: IconName;
  label: string;
  title: string;
  tone?: AuthPanelTone;
}): string {
  return `<section class="auth-card w-full max-w-[32rem] overflow-hidden rounded-lg border border-line bg-panel"><div class="${cn("h-1", tone === "danger" ? "bg-danger" : "bg-primary")}"></div><div class="grid gap-6 p-6 sm:p-8">${authHeader(
    {
      description,
      iconName,
      label,
      title,
      tone,
    },
  )}${children}</div></section>`;
}

export function authHeader({
  description,
  iconName,
  label,
  title,
  tone = "primary",
}: {
  description: string;
  iconName: IconName;
  label: string;
  title: string;
  tone?: AuthPanelTone;
}): string {
  return `<div class="grid justify-items-center gap-5 text-center"><div class="grid justify-items-center gap-3"><div class="${cn("grid h-12 w-12 shrink-0 place-items-center rounded-md border", tone === "danger" ? "border-danger/25 bg-danger/10 text-danger" : "border-primary/25 bg-primary/10 text-primary")}">${icon(
    iconName,
    24,
  )}</div><p class="${cn("text-sm font-semibold", tone === "danger" ? "text-danger" : "text-primary")}">${escapeHtml(label)}</p></div><div class="grid gap-2"><h1 class="text-3xl font-semibold leading-tight text-ink">${escapeHtml(title)}</h1><p class="text-sm leading-7 text-muted">${escapeHtml(description)}</p></div></div>`;
}
