/**
 * How a lead's source is shown to customers: never the scraping or AI provider
 * behind it ("Apify", "LLM"), just where the lead came from in plain words.
 * The stored value stays the same.
 */
export function sourceLabel(source: string | undefined | null): string {
  if (!source) return "—";
  if (source === "Apify") return "Lead search";
  if (source === "LLM") return "AI search";
  return source;
}
