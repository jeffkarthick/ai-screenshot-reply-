import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req) {
  try {
    const body = await req.json();

    const { image, mimeType, tone } = body;

    if (!image) {
      return NextResponse.json(
        { error: "Screenshot is required." },
        { status: 400 }
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "AI service is not configured." },
        { status: 500 }
      );
    }

    const prompt = `
You are an expert messaging reply assistant.

Analyze the conversation screenshot carefully.

Understand:
- What the other person said
- The conversation context
- The emotional tone
- What kind of response would naturally fit

Generate exactly 3 possible replies.

The selected tone is: ${tone || "Casual"}

Rules:
- Replies must sound natural and human.
- Do not mention that you are an AI.
- Do not invent information that is not visible in the screenshot.
- Keep replies reasonably short.
- Match the selected tone.
- Return ONLY valid JSON.

Format:
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
          "x-goog-api-key": process.env.GEMINI_API_KEY
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inlineData: {
                    mimeType: mimeType || "image/jpeg",
                    data: image
                  }
                },
                {
                  text: prompt
                }
              ]
            }
          ],
          generationConfig: {
            responseMimeType: "application/json"
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      console.error("Gemini API error:", errorText);

      return NextResponse.json(
        { error: "AI could not analyze the screenshot." },
        { status: 500 }
      );
    }

    const data = await response.json();

    const text =
      data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) {
      return NextResponse.json(
        { error: "AI returned an empty response." },
        { status: 500 }
      );
    }

    let parsed;

    try {
      parsed = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "AI returned an invalid response." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      replies: parsed.replies || []
    });

  } catch (error) {
    console.error("Generate error:", error);

    return NextResponse.json(
      { error: "Something went wrong." },
      { status: 500 }
    );
  }
}