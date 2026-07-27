import { NextResponse } from "next/server";
import { generateJson } from "@/lib/gemini";
import { EXTRACT_PROMPT, PageExtractionSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { image } = await req.json();
    if (!image) return NextResponse.json({ error: "No image provided" }, { status: 400 });

    const result = await generateJson({
      imageBase64: image,
      prompt: EXTRACT_PROMPT,
      schema: PageExtractionSchema,
      thinkingBudget: 4096,
    });

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
