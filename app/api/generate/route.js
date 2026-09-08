import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const body = await req.json();

    const { image, mimeType, tone } = body;

    if (!image || typeof image !== "string") {
      return NextResponse.json(
        { error: "Screenshot is required." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("GEMINI_API_KEY is missing.");

      return NextResponse.json(
        { error: "AI service is not configured." },
        { status: 500 }
      );
    }

    // Remove data:image/...;base64, prefix if present
    let base64Image = image;

    if (base64Image.includes(",")) {
      base64Image = base64Image.split(",")[1];
    }

    base64Image = base64Image.replace(/\s/g, "");

    if (!base64Image) {
      return NextResponse.json(
        { error: "Invalid screenshot data." },
        { status: 400 }
      );
    }

    const allowedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ];

    const finalMimeType = allowedMimeTypes.includes(mimeType)
      ? mimeType
      : "image/jpeg";

    const selectedTone =
      typeof tone === "string" && tone.trim()
        ? tone.trim()
        : "Casual";

    const prompt = `
You are ReplyAI, an expert messaging reply assistant.

Analyze the provided conversation screenshot carefully.

Understand:
- What the other person said
- The conversation context
- The emotional tone
- The likely intention
- What kind of response would naturally fit

Selected tone:
${selectedTone}

Generate exactly 3 possible replies.

Rules:
- Replies must sound natural and human.
- Do not mention AI.
- Do not mention this screenshot.
- Do not invent information that is not visible.
- Keep replies reasonably short.
- Match the selected tone.
- Each reply should be different.
- Return ONLY valid JSON.

Required JSON format:

{
  "replies": [
    "reply 1",
    "reply 2",
    "reply 3"
  ]
}
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.7-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: prompt,
                },
                {
                  inlineData: {
                    mimeType: finalMimeType,
                    data: base64Image,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
          },
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      console.error(
        "Gemini API error:",
        response.status,
        errorText
      );

      return NextResponse.json(
        {
          error: "AI could not analyze the screenshot.",
        },
        { status: 500 }
      );
    }

    const data = await response.json();

    const text = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || "")
      .join("")
      .trim();

    if (!text) {
      console.error("Empty Gemini response:", data);

      return NextResponse.json(
        { error: "AI returned an empty response." },
        { status: 500 }
      );
    }

    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch (error) {
      console.error("Invalid Gemini JSON:", text);

      return NextResponse.json(
        { error: "AI returned an invalid response." },
        { status: 500 }
      );
    }

    if (!parsed || !Array.isArray(parsed.replies)) {
      console.error("Invalid replies structure:", parsed);

      return NextResponse.json(
        { error: "AI returned an invalid reply format." },
        { status: 500 }
      );
    }

    const replies = parsed.replies
      .filter(
        (reply) =>
          typeof reply === "string" &&
          reply.trim().length > 0
      )
      .slice(0, 3);

    if (replies.length === 0) {
      return NextResponse.json(
        { error: "No replies were generated." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      replies,
    });
  } catch (error) {
    console.error("Generate route error:", error);

    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}