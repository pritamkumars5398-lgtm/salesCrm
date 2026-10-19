/**
 * Browser-side audio conversion for the practice call. ElevenLabs phone agents
 * speak and listen in μ-law 8 kHz (or PCM 16 kHz); browsers work in float32 at 44.1/48 kHz.
 */

export interface AudioFormat {
  codec: "ulaw" | "pcm";
  rate: number;
}

/** "ulaw_8000" | "pcm_16000" → format (defaults to PCM 16 kHz, ElevenLabs' default). */
export function parseFormat(name: string | undefined): AudioFormat {
  const m = /^(ulaw|pcm)_(\d+)$/.exec(name || "");
  return m ? { codec: m[1] as AudioFormat["codec"], rate: Number(m[2]) } : { codec: "pcm", rate: 16000 };
}

function ulawToLinear(u: number): number {
  const v = ~u & 0xff;
  const sign = v & 0x80;
  const exponent = (v >> 4) & 0x07;
  const mantissa = v & 0x0f;
  let sample = ((mantissa << 3) + 0x84) << exponent;
  sample -= 0x84;
  return sign ? -sample : sample;
}

function linearToUlaw(sample: number): number {
  const BIAS = 0x84;
  const CLIP = 32635;
  const sign = sample < 0 ? 0x80 : 0;
  let s = Math.min(CLIP, Math.abs(sample)) + BIAS;
  let exponent = 7;
  for (let mask = 0x4000; (s & mask) === 0 && exponent > 0; mask >>= 1) exponent--;
  const mantissa = (s >> (exponent + 3)) & 0x0f;
  return ~(sign | (exponent << 4) | mantissa) & 0xff;
}

export function base64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Agent audio chunk → float samples for an AudioBuffer at `format.rate`. */
export function decodeAgentAudio(b64: string, format: AudioFormat): Float32Array<ArrayBuffer> {
  const bytes = base64ToBytes(b64);
  if (format.codec === "ulaw") {
    const out = new Float32Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) out[i] = ulawToLinear(bytes[i]) / 32768;
    return out;
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength - (bytes.byteLength % 2));
  const out = new Float32Array(view.byteLength / 2);
  for (let i = 0; i < out.length; i++) out[i] = view.getInt16(i * 2, true) / 32768;
  return out;
}

/** Microphone samples (at `fromRate`) → base64 chunk in the agent's input format. */
export function encodeMicAudio(input: Float32Array, fromRate: number, format: AudioFormat): string {
  const ratio = fromRate / format.rate;
  const length = Math.floor(input.length / ratio);
  const resampled = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    // Average the source samples that fall into this output sample (cheap low-pass).
    const start = Math.floor(i * ratio);
    const end = Math.min(input.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = start; j < end; j++) sum += input[j];
    resampled[i] = end > start ? sum / (end - start) : input[start] ?? 0;
  }
  if (format.codec === "ulaw") {
    const out = new Uint8Array(length);
    for (let i = 0; i < length; i++) out[i] = linearToUlaw(Math.round(Math.max(-1, Math.min(1, resampled[i])) * 32767));
    return bytesToBase64(out);
  }
  const out = new Uint8Array(length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < length; i++) view.setInt16(i * 2, Math.round(Math.max(-1, Math.min(1, resampled[i])) * 32767), true);
  return bytesToBase64(out);
}
