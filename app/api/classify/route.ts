import { NextResponse } from "next/server";
import { generateJson } from "@/lib/gemini";
import { CLASSIFY_PROMPT, PageClassificationSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { image } = await req.json();
    if (!image) return NextResponse.json({ error: "No image provided" }, { status: 400 });

    const result = await generateJson<{ document_type: string }>({
      imageBase64: image,
      prompt: CLASSIFY_PROMPT,
      schema: PageClassificationSchema,
      // 3.x flash models reject thinkingBudget: 0 (400). 128 = lightest valid
      // budget — keeps classification fast while staying valid on 3.5/3.6.
      thinkingBudget: 128,
    });

    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
