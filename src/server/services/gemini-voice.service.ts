if (typeof process !== "undefined" && process.env) {
  process.env.WS_NO_BUFFER_UTIL = "true";
}
import { GoogleGenAI, Modality } from "@google/genai";
import { GEMINI_VOICES, DEFAULT_GEMINI_MODEL, type GeminiVoiceDef } from "@/lib/constants/gemini-voices";
export { GEMINI_VOICES, DEFAULT_GEMINI_MODEL, type GeminiVoiceDef };
export const GEMINI_SAMPLE_RATE = 24000;

export function pcmToWav(
  pcmBuffer: Buffer,
  sampleRate: number = GEMINI_SAMPLE_RATE,
  numChannels: number = 1,
  bitsPerSample: number = 16
): Buffer {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const dataSize = pcmBuffer.length;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcmBuffer.copy(buffer, 44);

  return buffer;
}

export interface GeminiSpeechOptions {
  apiKey?: string;
  voice?: string;
  model?: string;
}

export async function generateGeminiSpeech(
  text: string,
  options: GeminiSpeechOptions = {}
): Promise<Buffer> {
  const apiKey = options.apiKey || process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("No GEMINI_API_KEY available for Gemini voice synthesis");
  }

  const voice = options.voice || "Puck";
  const model = options.model || DEFAULT_GEMINI_MODEL;
  const ai = new GoogleGenAI({ apiKey });
  const chunks: Buffer[] = [];

  return new Promise<Buffer>(async (resolve, reject) => {
    try {
      const session = await ai.live.connect({
        model,
        config: {
          responseModalities: [Modality.AUDIO],
          systemInstruction:
            "You are a high-speed text-to-speech engine. Read the user input verbatim out loud. Do not add greetings, commentary, or conversational remarks. Only speak the exact words requested.",
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: voice },
            },
          },
        },
        callbacks: {
          onmessage: (msg: any) => {
            if (msg.serverContent?.modelTurn?.parts) {
              for (const p of msg.serverContent.modelTurn.parts) {
                if (p.inlineData?.data) {
                  chunks.push(Buffer.from(p.inlineData.data, "base64"));
                }
              }
            }
            if (msg.serverContent?.turnComplete) {
              try { session.close(); } catch {}
              if (chunks.length === 0) {
                return reject(new Error("Gemini returned empty audio response"));
              }
              const pcm = Buffer.concat(chunks);
              resolve(pcmToWav(pcm));
            }
          },
          onerror: (err: any) => {
            try { session.close(); } catch {}
            reject(err instanceof Error ? err : new Error(String(err)));
          },
          onclose: () => {
            if (chunks.length > 0) {
              resolve(pcmToWav(Buffer.concat(chunks)));
            }
          },
        },
      });

      session.sendRealtimeInput({ text });
    } catch (err) {
      reject(err);
    }
  });
}
