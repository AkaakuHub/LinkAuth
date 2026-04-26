import { cva, type VariantProps } from "class-variance-authority";
import { type ClassValue, clsx } from "clsx";
import type { ComponentProps, ReactElement, ReactNode } from "react";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

const buttonVariants = cva(
  "inline-flex min-h-10 items-center justify-center gap-2 rounded-md border px-4 text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
  {
    variants: {
      variant: {
        primary:
          "border-primary bg-primary text-primary-foreground hover:bg-primary/90 focus-visible:outline-primary",
        secondary:
          "border-line bg-panel text-ink hover:bg-haze focus-visible:outline-primary",
        danger:
          "border-danger bg-danger text-danger-foreground hover:bg-danger/90 focus-visible:outline-danger",
      },
    },
    defaultVariants: {
      variant: "primary",
    },
  },
);

export type ButtonProps = ComponentProps<"button"> &
  VariantProps<typeof buttonVariants>;

export function Button({
  className,
  variant,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant }), className)}
      type={type}
      {...props}
    />
  );
}

export type LinkButtonProps = ComponentProps<"a"> &
  VariantProps<typeof buttonVariants>;

export function LinkButton({ className, variant, ...props }: LinkButtonProps) {
  return (
    <a className={cn(buttonVariants({ variant }), className)} {...props} />
  );
}

export function Card({
  className,
  ...props
}: ComponentProps<"section">): ReactElement {
  return (
    <section
      className={cn(
        "rounded-lg border border-line bg-panel p-5 shadow-[0_18px_60px_rgb(24_24_24/0.08)]",
        className,
      )}
      {...props}
    />
  );
}

export function TextInput({ className, ...props }: ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-md border border-line bg-white px-3 text-sm text-ink outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20",
        className,
      )}
      {...props}
    />
  );
}

export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1 border-b border-line/70 py-3 sm:grid-cols-[10rem_1fr] sm:gap-4">
      <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
        {label}
      </dt>
      <dd className="min-w-0 break-words text-sm font-medium text-ink">
        {value}
      </dd>
    </div>
  );
}
