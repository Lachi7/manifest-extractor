import { GoogleGenAI, type Schema } from "@google/genai";

// Matches GEMINI_API_VL_5. Override with GEMINI_MODEL without touching code.
export const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Exponential backoff + jitter — ported from call_with_retry.
 * Retries on rate limits (429 / RESOURCE_EXHAUSTED) AND transient server
 * errors (503 UNAVAILABLE / 500 overloaded), which are temporary spikes in
 * demand that succeed on a later attempt.
 */
async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 6, baseDelay = 8): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      const retriable =
        msg.includes("429") ||
        msg.includes("RESOURCE_EXHAUSTED") ||
        msg.includes("503") ||
        msg.includes("UNAVAILABLE") ||
        msg.includes("500") ||
        msg.includes("overloaded");
      if (retriable && attempt < maxRetries - 1) {
        const delay = baseDelay * 2 ** attempt + Math.random() * 3;
        await sleep(delay * 1000);
        continue;
      }
      throw e;
    }
  }
  throw new Error("Max retries exceeded");
}

interface GenerateArgs {
  imageBase64: string;
  prompt: string;
  schema: Schema;
  thinkingBudget: number;
}

/** One structured-JSON Gemini call against a single page image. */
export async function generateJson<T = unknown>({ imageBase64, prompt, schema, thinkingBudget }: GenerateArgs): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set on the server. Add it to your environment / Vercel project settings.");
  }

  const ai = new GoogleGenAI({ apiKey });

  const res = await callWithRetry(() =>
    ai.models.generateContent({
      model: MODEL,
      contents: [
        { inlineData: { mimeType: "image/png", data: imageBase64 } },
        { text: prompt },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: schema,
        temperature: 0,
        thinkingConfig: { thinkingBudget },
      },
    })
  );

  const text = (res.text ?? "").trim();
  if (!text) throw new Error("Empty response from Gemini");

  // responseMimeType is JSON, but strip a stray ```json fence just in case.
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  return JSON.parse(cleaned) as T;
}
