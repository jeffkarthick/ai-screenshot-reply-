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

    if (base64Image.includes(",")) {
      base64Image = base64Image.split(",")[1];
    }

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
    // 4. MIME type
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
    // 5. Selected tone
    // ==========================================
    const selectedTone =
      typeof tone === "string" && tone.trim()
        ? tone.trim()
        : "Casual";

    // ==========================================
    // 6. Language-aware prompt
    // ==========================================
    const prompt = `
You are ReplyAI, an expert messaging reply assistant.

You are given a screenshot of a real conversation.

Your job is to understand the conversation and generate exactly 3 natural replies.

IMPORTANT LANGUAGE RULE:

The replies MUST be written in the SAME LANGUAGE, SCRIPT, AND WRITING STYLE used by the person who is being replied to.

DO NOT automatically write the replies in English.

First carefully identify the language and writing style of the latest relevant incoming message in the screenshot.

Possible examples include:

- English
- Tamil
- Tanglish (Tamil written using English/Latin letters)
- Malayalam
- Manglish (Malayalam written using English/Latin letters)
- Hindi
- Hinglish
- Telugu
- Kannada
- Bengali
- Marathi
- Any other language
- Mixed languages

LANGUAGE MATCHING RULES:

1. If the conversation is in Tamil script, reply in Tamil script.

Example:
Incoming:
"என்ன பண்ற?"

Reply:
"ஒன்னும் இல்ல, நீ என்ன பண்ற?"

2. If the conversation is Tanglish, reply in Tanglish.

Example:
Incoming:
"enna panra?"

Reply:
"onnum illa, nee enna panra?"

3. If the conversation is Malayalam script, reply in Malayalam script.

4. If the conversation is Manglish, reply in Manglish.

5. If the conversation mixes Tamil and English, preserve the same Tamil-English mix.

Example:
Incoming:
"office mudichitiya?"

Reply:
"illa, innum konjam work iruku"

6. If the conversation is Hindi, reply in Hindi.

7. If the conversation is Hinglish, reply in Hinglish.

8. If the conversation is English, reply in English.

9. If the conversation uses slang, abbreviations, casual spelling, emojis, or short forms, naturally match that style.

10. DO NOT translate the conversation into English before replying.

11. DO NOT change Tamil into English.

12. DO NOT change Tanglish into Tamil script.

13. DO NOT change Malayalam into English.

14. DO NOT change Manglish into Malayalam script.

15. The language of the website UI has NO influence on the reply language.

16. The selected tone also has NO influence on the reply language.

The conversation language is more important than the language of this instruction.

SELECTED TONE:
${selectedTone}

CONVERSATION UNDERSTANDING:

Carefully determine:
- What the other person said
- Who is being replied to
- The latest relevant incoming message
- The emotional context
- The intention of the message
- The natural way a real person would respond

REPLY RULES:

- Generate exactly 3 replies.
- Replies must sound natural and human.
- Keep them reasonably short.
- Match the selected tone.
- Match the conversation's language.
- Match the conversation's script.
- Match the conversation's slang/style.
- Do not mention AI.
- Do not mention the screenshot.
- Do not invent information that is not visible.
- Do not translate the message.
- Do not add explanations.
- Each reply should be different.

VERY IMPORTANT:

If the latest message is Tanglish, ALL 3 replies must be Tanglish.

If the latest message is Tamil script, ALL 3 replies must be Tamil script.

If the latest message is Malayalam, ALL 3 replies must be Malayalam.

If the latest message is Manglish, ALL 3 replies must be Manglish.

If the latest message is English, ALL 3 replies must be English.

Return ONLY valid JSON.

Required format:

{
  "replies": [
    "reply 1",
    "reply 2",
    "reply 3"
  ]
}
`;

    // ==========================================
    // 7. Gemini API
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
    // 9. Read response
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