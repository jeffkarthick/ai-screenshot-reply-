import { NextResponse } from "next/server";

export const runtime = "nodejs";

// ============================================================
// MODELS
// ============================================================

const MODELS = [
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
];

// ============================================================
// HELPERS
// ============================================================

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isTemporaryError(status, errorText = "") {
  const text = String(errorText).toLowerCase();

  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    text.includes("high demand") ||
    text.includes("unavailable") ||
    text.includes("temporarily")
  );
}

async function callGemini({
  model,
  apiKey,
  prompt,
  base64Image,
  mimeType,
}) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `${model}:generateContent`;

  const response = await fetch(url, {
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
                mimeType,
                data: base64Image,
              },
            },
          ],
        },
      ],

      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.8,
      },
    }),
  });

  const text = await response.text();

  return {
    response,
    text,
  };
}

// ============================================================
// POST
// ============================================================

export async function POST(req) {
  try {
    const body = await req.json();

    const {
      image,
      mimeType,
      tone,
    } = body;

    // ========================================================
    // 1. IMAGE VALIDATION
    // ========================================================

    if (
      !image ||
      typeof image !== "string"
    ) {
      return NextResponse.json(
        {
          error:
            "Screenshot is required.",
        },
        { status: 400 }
      );
    }

    // ========================================================
    // 2. API KEY
    // ========================================================

    const apiKey =
      process.env.GEMINI_API_KEY;

    if (!apiKey) {
      console.error(
        "GEMINI_API_KEY is missing."
      );

      return NextResponse.json(
        {
          error:
            "AI service is not configured.",
        },
        { status: 500 }
      );
    }

    // ========================================================
    // 3. BASE64 CLEANUP
    // ========================================================

    let base64Image = image;

    // Supports:
    // data:image/jpeg;base64,XXXX
    if (base64Image.includes(",")) {
      base64Image =
        base64Image.split(",")[1];
    }

    base64Image =
      base64Image.replace(
        /\s/g,
        ""
      );

    if (!base64Image) {
      return NextResponse.json(
        {
          error:
            "Invalid screenshot data.",
        },
        { status: 400 }
      );
    }

    // ========================================================
    // 4. MIME TYPE
    // ========================================================

    const allowedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ];

    const finalMimeType =
      allowedMimeTypes.includes(
        mimeType
      )
        ? mimeType
        : "image/jpeg";

    // ========================================================
    // 5. TONE
    // ========================================================

    const selectedTone =
      typeof tone === "string" &&
      tone.trim()
        ? tone.trim()
        : "Casual";

    // ========================================================
    // 6. PROMPT
    // ========================================================

    const prompt = `
You are ReplyAI, an expert messaging reply assistant.

You are given a screenshot of a real conversation.

Your job is to understand the conversation and generate exactly 3 natural replies.

IMPORTANT LANGUAGE RULE:

The replies MUST use the SAME LANGUAGE, SCRIPT, AND WRITING STYLE used in the conversation.

Do NOT automatically reply in English.

Detect the language of the latest relevant incoming message.

Possible languages/styles include:

- English
- Tamil
- Tanglish
- Malayalam
- Manglish
- Hindi
- Hinglish
- Telugu
- Kannada
- Bengali
- Marathi
- Any other language
- Mixed languages

LANGUAGE RULES:

1. Tamil script -> Tamil script.
2. Tanglish -> Tanglish.
3. Malayalam script -> Malayalam script.
4. Manglish -> Manglish.
5. Hindi -> Hindi.
6. Hinglish -> Hinglish.
7. English -> English.
8. Mixed language -> preserve the same mix.
9. Match slang and casual spelling.
10. Match emojis when appropriate.
11. Do not translate the conversation into English.
12. Do not change Tanglish into Tamil script.
13. Do not change Malayalam into English.
14. Do not change Manglish into Malayalam script.
15. Website language must NOT affect reply language.

The conversation's language is more important than this instruction's language.

SELECTED TONE:
${selectedTone}

UNDERSTAND:

- What the other person said
- Who should be replied to
- The latest relevant message
- Conversation context
- Emotional tone
- Intent
- Natural response style

REPLY RULES:

- Generate exactly 3 replies.
- Keep replies reasonably short.
- Make them sound human.
- Match the selected tone.
- Match the language.
- Match the script.
- Match the slang/style.
- Do not mention AI.
- Do not mention the screenshot.
- Do not invent information.
- Do not explain your reasoning.
- Do not translate the message.
- Each reply must be different.

VERY IMPORTANT:

If the conversation is Tanglish, ALL 3 replies must be Tanglish.

If the conversation is Tamil script, ALL 3 replies must be Tamil script.

If the conversation is Malayalam, ALL 3 replies must be Malayalam.

If the conversation is Manglish, ALL 3 replies must be Manglish.

If the conversation is English, ALL 3 replies must be English.

Return ONLY valid JSON.

FORMAT:

{
  "replies": [
    "reply 1",
    "reply 2",
    "reply 3"
  ]
}
`;

    // ========================================================
    // 7. TRY MODELS
    // ========================================================

    let lastError = "";

    for (
      let modelIndex = 0;
      modelIndex < MODELS.length;
      modelIndex++
    ) {
      const model =
        MODELS[modelIndex];

      // ------------------------------------------------------
      // Retry current model once for temporary overload
      // ------------------------------------------------------

      for (
        let attempt = 0;
        attempt < 2;
        attempt++
      ) {
        try {
          console.log(
            `Trying Gemini model: ${model}, attempt: ${
              attempt + 1
            }`
          );

          const result =
            await callGemini({
              model,
              apiKey,
              prompt,
              base64Image,
              mimeType:
                finalMimeType,
            });

          const {
            response,
            text,
          } = result;

          // ==================================================
          // SUCCESS
          // ==================================================

          if (response.ok) {
            let data;

            try {
              data = JSON.parse(text);
            } catch {
              lastError =
                "Gemini returned invalid JSON.";

              break;
            }

            const generatedText =
              data
                ?.candidates?.[0]
                ?.content?.parts
                ?.map(
                  (part) =>
                    part?.text || ""
                )
                .join("")
                .trim();

            if (!generatedText) {
              lastError =
                "AI returned an empty response.";

              break;
            }

            let parsed;

            try {
              parsed =
                JSON.parse(
                  generatedText
                );
            } catch {
              console.error(
                "Invalid generated JSON:",
                generatedText
              );

              lastError =
                "AI returned an invalid response.";

              break;
            }

            if (
              !parsed ||
              !Array.isArray(
                parsed.replies
              )
            ) {
              lastError =
                "AI returned an invalid reply format.";

              break;
            }

            const replies =
              parsed.replies
                .filter(
                  (reply) =>
                    typeof reply ===
                      "string" &&
                    reply.trim()
                      .length > 0
                )
                .map((reply) =>
                  reply.trim()
                )
                .slice(0, 3);

            if (
              replies.length === 0
            ) {
              lastError =
                "No replies were generated.";

              break;
            }

            console.log(
              `Gemini success using ${model}`
            );

            return NextResponse.json({
              replies,
            });
          }

          // ==================================================
          // API ERROR
          // ==================================================

          lastError = text;

          console.error(
            `Gemini ${model} error:`,
            response.status,
            text
          );

          // If temporary error:
          // retry once, then move to next model.
          if (
            isTemporaryError(
              response.status,
              text
            )
          ) {
            if (attempt === 0) {
              await sleep(700);
              continue;
            }

            break;
          }

          // Non-temporary error:
          // do not blindly retry the same model.
          break;

        } catch (error) {
          console.error(
            `Gemini ${model} request failed:`,
            error
          );

          lastError =
            error?.message ||
            "Gemini request failed.";

          if (attempt === 0) {
            await sleep(700);
            continue;
          }

          break;
        }
      }
    }

    // ========================================================
    // 8. ALL MODELS FAILED
    // ========================================================

    console.error(
      "All Gemini models failed:",
      lastError
    );

    return NextResponse.json(
      {
        error:
          "AI is temporarily busy. Please try again in a few seconds.",
      },
      { status: 503 }
    );

  } catch (error) {
    console.error(
      "Generate route error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Something went wrong. Please try again.",
      },
      { status: 500 }
    );
  }
}