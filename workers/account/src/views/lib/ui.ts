import { cva, type VariantProps } from "class-variance-authority";
import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { attr, escapeHtml } from "./html.js";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-45",
  {
    variants: {
      variant: {
        primary:
          "border-primary bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-primary",
        secondary:
          "border-line bg-panel text-ink hover:border-muted hover:bg-haze focus-visible:outline-primary",
        danger:
          "border-danger bg-danger text-danger-foreground hover:bg-danger/90 focus-visible:outline-danger",
      },
    },
    defaultVariants: {
      variant: "primary",
    },
  },
);

type ButtonVariant = VariantProps<typeof buttonVariants>["variant"];

export function button({
  children,
  className,
  variant,
  type = "button",
  disabled = false,
  attributes = "",
}: {
  children: string;
  className?: string;
  variant?: ButtonVariant;
  type?: "button" | "submit";
  disabled?: boolean;
  attributes?: string;
}): string {
  return `<button class="${cn(buttonVariants({ variant }), className)}" type="${type}"${attr("disabled", disabled)}${attributes}>${children}</button>`;
}

export function linkButton({
  children,
  href,
  className,
  variant,
  attributes = "",
}: {
  children: string;
  href: string;
  className?: string;
  variant?: ButtonVariant;
  attributes?: string;
}): string {
  return `<a class="${cn(buttonVariants({ variant }), className)}" href="${escapeHtml(href)}"${attributes}>${children}</a>`;
}

export function card({
  children,
  className,
}: {
  children: string;
  className?: string;
}): string {
  return `<section class="${cn("rounded-lg border border-line bg-panel p-3", className)}">${children}</section>`;
}

export function textInput({
  className,
  attributes = "",
}: {
  className?: string;
  attributes?: string;
}): string {
  return `<input class="${cn("h-12 w-full rounded-md border border-line bg-paper px-3 text-sm text-ink outline-none transition placeholder:text-muted/70 focus:border-primary focus:ring-2 focus:ring-primary/25", className)}"${attributes}>`;
}

export function formField({
  control,
  label,
  labelFor,
}: {
  control: string;
  label: string;
  labelFor: string;
}): string {
  return `<div class="grid gap-2"><label class="text-sm font-semibold text-ink" for="${escapeHtml(labelFor)}">${escapeHtml(label)}</label>${control}</div>`;
}

export function radioOption({
  checked = false,
  label,
  name,
  value,
}: {
  checked?: boolean;
  label: string;
  name: string;
  value: string;
}): string {
  return `<label class="${cn("flex min-h-11 items-center gap-2 rounded-md border border-line bg-paper px-3 text-sm font-medium text-ink transition-colors has-checked:border-primary has-checked:bg-primary/15")}"><input class="accent-primary" type="radio"${attr("name", name)}${attr("value", value)}${attr("checked", checked)}>${escapeHtml(label)}</label>`;
}

export function field({
  label,
  value,
}: {
  label: string;
  value: string;
}): string {
  return `<div class="grid gap-1 border-b border-line/70 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4"><dt class="text-sm font-medium text-muted">${escapeHtml(label)}</dt><dd class="min-w-0 wrap-break-word text-sm font-medium text-ink">${value}</dd></div>`;
}
