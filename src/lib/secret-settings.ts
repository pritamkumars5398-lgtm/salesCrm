/**
 * Stored API keys / passwords are never sent back to the browser in full.
 * The API returns MASK_PREFIX + last 4 characters; a save that sends a masked
 * value back means "unchanged" and keeps what is stored.
 */
export const MASK_PREFIX = "••••••••";

export function isSecretSettingKey(key: string): boolean {
  return /(ApiKey|Token|Secret|Pass)$/.test(key);
}

export function maskSecretValue(value: string): string {
  if (!value) return "";
  return `${MASK_PREFIX}${value.length > 8 ? value.slice(-4) : ""}`;
}

export function isMaskedValue(value: unknown): boolean {
  return typeof value === "string" && value.startsWith(MASK_PREFIX);
}
