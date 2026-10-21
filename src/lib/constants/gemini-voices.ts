export interface GeminiVoiceDef {
  id: string;
  name: string;
  gender: "female" | "male";
  desc: string;
  tone: string;
}

export const GEMINI_VOICES: GeminiVoiceDef[] = [
  // ── Female Voices ──
  { id: "Aoede", name: "Aoede", gender: "female", desc: "Warm, breezy & melodious", tone: "Natural, friendly and pleasant tone" },
  { id: "Kore", name: "Kore", gender: "female", desc: "Calm, firm & professional", tone: "Executive, corporate and articulate" },
  { id: "Leda", name: "Leda", gender: "female", desc: "Expressive, lively & conversational", tone: "Engaging and upbeat delivery" },
  { id: "Despina", name: "Despina", gender: "female", desc: "Smooth, gentle & natural", tone: "Reassuring, soft-spoken tone" },
  { id: "Callirrhoe", name: "Callirrhoe", gender: "female", desc: "Bright, confident & articulate", tone: "Modern customer-centric tone" },

  // ── Male Voices ──
  { id: "Puck", name: "Puck", gender: "male", desc: "Upbeat, playful & energetic", tone: "Enthusiastic and natural sales style" },
  { id: "Charon", name: "Charon", gender: "male", desc: "Deep, informative & steady", tone: "Calm, authoritative consultant voice" },
  { id: "Fenrir", name: "Fenrir", gender: "male", desc: "Dynamic, strong & authoritative", tone: "Bold, confident business closer" },
  { id: "Zephyr", name: "Zephyr", gender: "male", desc: "Modern, crisp & articulate", tone: "Clean and sharp conversational tone" },
  { id: "Orus", name: "Orus", gender: "male", desc: "Friendly, approachable & steady", tone: "Patient advisor and helpful tone" },
];

export const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";
