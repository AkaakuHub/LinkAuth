import { attr, escapeHtml } from "./html.js";

export function avatarAssetUrl(
  iconSource: "discord" | "r2" | "none" | undefined,
  iconKey: string | undefined,
  options: { baseUrl?: string } = {},
): string | null {
  if (iconSource !== "r2" || !iconKey) {
    return null;
  }
  const path = `/assets/${encodeAssetKey(iconKey)}`;
  return options.baseUrl ? new URL(path, options.baseUrl).toString() : path;
}

export function profileInitial(displayName: string): string {
  return displayName.trim().slice(0, 1).toUpperCase() || "?";
}

export function profileAvatar({
  avatarUrl,
  displayName,
  sizeClassName = "h-28 w-28",
}: {
  avatarUrl: string | null;
  displayName: string;
  sizeClassName?: string;
}): string {
  if (avatarUrl) {
    return `<img class="${sizeClassName} rounded-full border-4 border-panel bg-panel object-cover shadow-sm"${attr("src", avatarUrl)}${attr("alt", `${displayName}のアイコン`)}>`;
  }
  return `<div class="grid ${sizeClassName} place-items-center rounded-full border-4 border-panel bg-primary text-3xl font-semibold text-primary-foreground shadow-sm" aria-hidden="true">${escapeHtml(profileInitial(displayName))}</div>`;
}

function encodeAssetKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}
