import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const body = await req.json();

    const { image, mimeType, tone } = body;

    // ==========================================
    // 1. Validate screenshot
    // ==========================================
    if (!image || typeof image !== "string") {
      return NextResponse.json(
        {
          error: "Screenshot is required.",
        },
        { status: 400 }
      );
    }

    // ==========================================
    // 2. Check Gemini API key
    // ==========================================
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error("GEMINI_API_KEY is missing.");

      return NextResponse.json(
        {
          error: "AI service is not configured.",
        },
        { status: 500 }
      );
    }

    // ==========================================
    // 3. Clean Base64 image
    // ==========================================
    let base64Image = image;

    // Handles:
    // data:image/jpeg;base64,XXXX
    // data:image/png;base64,XXXX
    if (base64Image.includes(",")) {
      base64Image = base64Image.split(",")[1];
    }

    // Remove spaces/newlines
    base64Image = base64Image.replace(/\s/g, "");

    if (!base64Image) {
      return NextResponse.json(
        {
          error: "Invalid screenshot data.",
        },
        { status: 400 }
      );
    }

    // ==========================================
    // 4. Validate MIME type
    // ==========================================
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

    // ==========================================
    // 5. Tone
    // ==========================================
    const selectedTone =
      typeof tone === "string" && tone.trim()
        ? tone.trim()
        : "Casual";

    // ==========================================
    // 6. AI Prompt
    // ==========================================
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

    // ==========================================
    // 7. Call Gemini
    // ==========================================
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

    // ==========================================
    // 8. Gemini API error
    // ==========================================
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
          details: errorText,
        },
        { status: 500 }
      );
    }

    // ==========================================
    // 9. Read Gemini response
    // ==========================================
    const data = await response.json();

    const text = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || "")
      .join("")
      .trim();

    if (!text) {
      console.error(
        "Gemini returned empty response:",
        JSON.stringify(data, null, 2)
      );

      return NextResponse.json(
        {
          error: "AI returned an empty response.",
        },
        { status: 500 }
      );
    }

    // ==========================================
    // 10. Parse JSON
    // ==========================================
    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch (error) {
      console.error(
        "Gemini returned invalid JSON:",
        text
      );

      return NextResponse.json(
        {
          error: "AI returned an invalid response.",
          details: text,
        },
        { status: 500 }
      );
    }

    // ==========================================
    // 11. Validate replies
    // ==========================================
    if (
      !parsed ||
      !Array.isArray(parsed.replies)
    ) {
      console.error(
        "Invalid replies structure:",
        parsed
      );

      return NextResponse.json(
        {
          error: "AI returned an invalid reply format.",
        },
        { status: 500 }
      );
    }

    // ==========================================
    // 12. Clean replies
    // ==========================================
    const replies = parsed.replies
      .filter(
        (reply) =>
          typeof reply === "string" &&
          reply.trim().length > 0
      )
      .map((reply) => reply.trim())
      .slice(0, 3);

    if (replies.length === 0) {
      return NextResponse.json(
        {
          error: "No replies were generated.",
        },
        { status: 500 }
      );
    }

    // ==========================================
    // 13. Success
    // ==========================================
    return NextResponse.json({
      replies,
    });

  } catch (error) {
    console.error(
      "Generate route error:",
      error
    );

    return NextResponse.json(
      {
        error: "Something went wrong.",
      },
      { status: 500 }
    );
  }
}