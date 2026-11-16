import { gateway, generateSpeech } from "ai";

export const maxDuration = 60;

const MODEL = process.env.TTS_MODEL ?? "openai/gpt-4o-mini-tts";
const VOICE = process.env.TTS_VOICE ?? "alloy";
const available = () => Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);

/** Tells the client whether recordable studio narration is configured. */
export function GET() {
  return Response.json({ available: available() });
}

/** Speaks one beat of narration and returns it as MP3. */
export async function POST(req: Request) {
  if (!available()) {
    return Response.json({ error: "Studio voice is not configured. Set AI_GATEWAY_API_KEY." }, { status: 503 });
  }
  const body = (await req.json().catch(() => null)) as { text?: string; lang?: string } | null;
  const text = body?.text?.trim().slice(0, 800);
  if (!text) return Response.json({ error: "No text." }, { status: 400 });

  try {
    const { audio } = await generateSpeech({
      model: gateway.speech(MODEL),
      text,
      voice: VOICE,
      outputFormat: "mp3",
      language: body?.lang === "ar" ? "ar" : "auto",
      instructions: "Speak like a warm, clear teacher explaining a lesson to students.",
    });
    return new Response(audio.uint8Array as BodyInit, {
      headers: { "content-type": "audio/mpeg", "cache-control": "private, max-age=86400" },
    });
  } catch (err) {
    console.error("tts failed", err);
    return Response.json({ error: "The voice request failed." }, { status: 502 });
  }
}
