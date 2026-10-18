/** Default Groq chat model. Groq retired the Llama 3.x models this app used to default to. */
export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

/** Models Groq no longer serves — still common in old .env files and saved settings. */
const RETIRED_GROQ_MODELS = /^(llama-3\.3-70b-versatile|llama-3\.1-8b-instant|llama3-|llama-3\.1-70b|mixtral-|gemma)/i;

/** The Groq model to use: the configured one unless it's empty or retired. */
export function resolveGroqModel(configured?: string | null): string {
  const model = (configured || "").trim();
  return !model || RETIRED_GROQ_MODELS.test(model) ? DEFAULT_GROQ_MODEL : model;
}

/**
 * Extra request params a model needs. gpt-oss models reason before answering and
 * count that against max_tokens — at default effort they exhaust small budgets
 * (e.g. 300 tokens for a JSON reply) and return nothing.
 */
export function groqModelParams(model: string): Record<string, unknown> {
  return /gpt-oss/i.test(model) ? { reasoning_effort: "low" } : {};
}
