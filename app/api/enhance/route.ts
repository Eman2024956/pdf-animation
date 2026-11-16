import { generateText, Output } from "ai";
import { z } from "zod";

export const maxDuration = 120;

const MODEL = process.env.AI_MODEL ?? "anthropic/claude-sonnet-5.5";
const available = () => Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);

const schema = z.object({
  scenes: z
    .array(
      z.object({
        kind: z.enum(["concept", "definition", "formula", "example", "steps", "summary"]),
        title: z.string().describe("Short scene heading, at most 8 words"),
        intro: z.string().describe("One friendly spoken sentence that introduces the scene"),
        points: z
          .array(z.string())
          .describe("1-4 short spoken sentences shown on screen one at a time. For a definition: exactly one, the definition itself."),
        term: z.string().nullable().describe("The term being defined (definition scenes only)"),
        formula: z.string().nullable().describe("The formula in plain text, e.g. F = m × a (formula scenes only)"),
      }),
    )
    .describe("6 to 12 scenes, in teaching order, ending with a summary"),
});

/** Tells the client whether AI rewriting is configured on this deployment. */
export function GET() {
  return Response.json({ available: available() });
}

/** Rewrites one chapter of textbook text as a sequence of teacher-style animated scenes. */
export async function POST(req: Request) {
  if (!available()) {
    return Response.json({ error: "AI is not configured. Set AI_GATEWAY_API_KEY." }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as { title?: string; text?: string; lang?: string } | null;
  const text = body?.text?.slice(0, 9000);
  if (!text || text.length < 100) return Response.json({ error: "Not enough text." }, { status: 400 });

  try {
    const { output } = await generateText({
      model: MODEL,
      output: Output.object({ schema }),
      system:
        "You are a warm, clear teacher turning a textbook chapter into a short animated lesson for students. " +
        "Explain ideas simply, in your own words, staying faithful to the source. Do not invent facts that are not in the text. " +
        "Every sentence will be read aloud, so write natural spoken language with no markdown. " +
        `Write in ${body?.lang === "ar" ? "Arabic" : "the language of the source text"}.`,
      prompt: `Chapter title: ${body?.title ?? "Untitled"}\n\nSource text:\n${text}`,
    });
    return Response.json(output);
  } catch (err) {
    console.error("enhance failed", err);
    return Response.json({ error: "The AI request failed. Try again." }, { status: 502 });
  }
}
