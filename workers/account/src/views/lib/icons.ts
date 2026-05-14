import tablerNodes from "../../../../../node_modules/@tabler/icons/tabler-nodes-outline.json" with {
  type: "json",
};
import { attr, escapeHtml } from "./html.js";

export type IconName =
  | "alert-triangle"
  | "apps"
  | "arrow-left"
  | "brand-discord"
  | "check"
  | "home"
  | "id"
  | "login-2"
  | "logout"
  | "pencil"
  | "settings"
  | "shield-check"
  | "trash"
  | "user"
  | "x";

type IconNode = readonly [
  tagName: string,
  attributes: Readonly<Record<string, string>>,
];

const iconNames: Record<IconName, IconName> = {
  "alert-triangle": "alert-triangle",
  apps: "apps",
  "arrow-left": "arrow-left",
  "brand-discord": "brand-discord",
  check: "check",
  home: "home",
  id: "id",
  "login-2": "login-2",
  logout: "logout",
  pencil: "pencil",
  settings: "settings",
  "shield-check": "shield-check",
  trash: "trash",
  user: "user",
  x: "x",
};

export function icon(name: IconName, size = 18): string {
  const nodes = iconNodes(iconNames[name]);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${renderNodes(nodes)}</svg>`;
}

function iconNodes(name: IconName): readonly IconNode[] {
  const nodes = (tablerNodes as Record<string, unknown>)[name];
  if (!Array.isArray(nodes) || !nodes.every(isIconNode)) {
    throw new Error(`Tabler icon is not available: ${name}`);
  }
  return nodes;
}

function isIconNode(value: unknown): value is IconNode {
  if (!Array.isArray(value) || value.length !== 2) {
    return false;
  }
  const [tagName, attributes] = value;
  return (
    typeof tagName === "string" &&
    attributes !== null &&
    typeof attributes === "object" &&
    Object.values(attributes).every(
      (attribute) => typeof attribute === "string",
    )
  );
}

function renderNodes(nodes: readonly IconNode[]): string {
  return nodes
    .map(([tagName, attributes]) => {
      const attributeText = Object.entries(attributes)
        .map(([name, value]) => attr(name, value))
        .join("");
      return `<${escapeHtml(tagName)}${attributeText}></${escapeHtml(tagName)}>`;
    })
    .join("");
}
