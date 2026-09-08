import { NextResponse } from "next/server";
import { redis } from "../../../lib/upstash";
import crypto from "crypto";

export const runtime = "nodejs";

const MODELS = [
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-2.5-flash",
];

const STARTING_REPLIES = 5;

function createUserId() {
  return crypto.randomUUID();
}

function getUserKey(userId) {
  return `replyai:user:${userId}`;
}

function getRepliesKey(userId) {
  return `replyai:replies:${userId}`;
}

function getTotalGeneratedKey(userId) {
  return `replyai:generated:${userId}`;
}

function getScreenshotUsageKey(userId, fingerprint) {
  return `replyai:used:${userId}:${fingerprint}`;
}

function createScreenshotFingerprint(image) {
  return crypto
    .createHash("sha256")
    .update(image)
    .digest("hex");
}

function cleanBase64Image(image) {
  if (!image || typeof image !== "string") {
    return "";
  }

  if (image.includes(",")) {
    return image.split(",")[1];
  }

  return image;
}

function isTemporaryError(status, errorText = "") {
  const text = errorText.toLowerCase();

  return (
    status === 429 ||
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    text.includes("high demand") ||
    text.includes("temporarily") ||
    text.includes("unavailable") ||
    text.includes("overloaded")
  );
}

function buildPrompt(tone) {
  return `
You are ReplyAI, an expert messaging reply assistant.

Analyze the conversation screenshot carefully.

Understand:
- What the other person said
- The conversation context
- The emotional tone
- The relationship/context visible in the screenshot
- The language and writing style used in the conversation

Generate exactly 3 natural reply suggestions.

Selected tone:
${tone || "Casual"}

IMPORTANT LANGUAGE RULES:

The replies MUST use the same language, script and writing style as the conversation in the screenshot.

Examples:

- Tamil script conversation → reply in Tamil script
- Tanglish conversation → reply in Tanglish
- English conversation → reply in English
- Malayalam script → reply in Malayalam
- Manglish → reply in Manglish
- Hindi → reply in Hindi
- Hinglish → reply in Hinglish
- Mixed-language conversation → preserve the same natural mix

Do NOT automatically translate the conversation into English.

Do NOT convert Tanglish into Tamil script.

Do NOT convert Malayalam into English.

Preserve:
- slang
- abbreviations
- casual spelling
- emojis
- punctuation style
- texting style
- short forms
- natural conversational expressions

The website interface language must NOT affect the reply language.

The selected tone must NOT change the language.

Tone should affect only the personality/style of the response.

Rules:
- Replies must sound natural and human.
- Do not mention that you are an AI.
- Do not invent information that is not visible in the screenshot.
- Keep replies reasonably short.
- Match the selected tone.
- Preserve the conversation's language and style.
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
}

/*
 * ==========================================
 * ATOMIC REPLY USAGE
 *
 * Result:
 *
 * > 0  = this screenshot consumed one reply
 *   0  = no replies remaining
 *  -1  = this screenshot was already used
 *
 * This prevents:
 * Casual -> Romantic -> Funny
 * from consuming multiple replies.
 * ==========================================
 */

async function consumeReplyOnce(
  repliesKey,
  screenshotUsageKey
) {
  const script = `
    local alreadyUsed = redis.call(
      "EXISTS",
      KEYS[2]
    )

    if alreadyUsed == 1 then
      return -1
    end

    local remaining = tonumber(
      redis.call(
        "GET",
        KEYS[1]
      ) or "0"
    )

    if remaining <= 0 then
      return 0
    end

    local newRemaining =
      redis.call(
        "DECR",
        KEYS[1]
      )

    redis.call(
      "SET",
      KEYS[2],
      "1"
    )

    return newRemaining
  `;

  return await redis.eval(
    script,
    [
      repliesKey,
      screenshotUsageKey,
    ],
    []
  );
}

export async function POST(req) {
  let userId = null;

  try {
    const body = await req.json();

    const {
      image,
      mimeType,
      tone,
    } = body;

    if (!image) {
      return NextResponse.json(
        {
          error:
            "Screenshot is required.",
        },
        {
          status: 400,
        }
      );
    }

    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        {
          error:
            "AI service is not configured.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * =========================================
     * USER ID
     * =========================================
     */

    const existingUserId =
      req.cookies.get(
        "replyai_user_id"
      )?.value;

    if (existingUserId) {
      userId = existingUserId;
    } else {
      userId = createUserId();
    }

    const userKey =
      getUserKey(userId);

    const repliesKey =
      getRepliesKey(userId);

    const totalGeneratedKey =
      getTotalGeneratedKey(userId);

    /*
     * =========================================
     * USER RECORD
     * =========================================
     */

    let user =
      await redis.get(userKey);

    if (!user) {
      user = {
        id: userId,
        repliesRemaining:
          STARTING_REPLIES,
        totalGenerated: 0,
        createdAt:
          new Date().toISOString(),
      };

      await redis.set(
        userKey,
        user
      );

      await redis.set(
        repliesKey,
        STARTING_REPLIES,
        {
          nx: true,
        }
      );
    } else {
      /*
       * Migrate users created by the
       * previous version.
       */

      const existingReplies =
        await redis.get(
          repliesKey
        );

      if (
        existingReplies === null
      ) {
        await redis.set(
          repliesKey,
          Number(
            user.repliesRemaining ??
              STARTING_REPLIES
          ),
          {
            nx: true,
          }
        );
      }
    }

    /*
     * =========================================
     * CURRENT REPLY COUNT
     * =========================================
     */

    let repliesRemaining =
      Number(
        await redis.get(
          repliesKey
        )
      );

    if (
      Number.isNaN(
        repliesRemaining
      )
    ) {
      repliesRemaining =
        STARTING_REPLIES;

      await redis.set(
        repliesKey,
        STARTING_REPLIES
      );
    }

    /*
     * =========================================
     * EARLY USAGE CHECK
     * =========================================
     */

    if (repliesRemaining <= 0) {
      const response =
        NextResponse.json(
          {
            error:
              "You've used all your free replies.",
            code:
              "NO_REPLIES_LEFT",
            repliesRemaining: 0,
          },
          {
            status: 402,
          }
        );

      response.cookies.set(
        "replyai_user_id",
        userId,
        {
          httpOnly: true,
          secure:
            process.env.NODE_ENV ===
            "production",
          sameSite: "lax",
          maxAge:
            60 * 60 * 24 * 365,
          path: "/",
        }
      );

      return response;
    }

    /*
     * =========================================
     * IMAGE VALIDATION
     * =========================================
     */

    const allowedMimeTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic",
      "image/heif",
    ];

    const finalMimeType =
      mimeType ||
      "image/jpeg";

    if (
      !allowedMimeTypes.includes(
        finalMimeType
      )
    ) {
      return NextResponse.json(
        {
          error:
            "Unsupported image format.",
        },
        {
          status: 400,
        }
      );
    }

    const cleanImage =
      cleanBase64Image(image);

    if (!cleanImage) {
      return NextResponse.json(
        {
          error:
            "Invalid screenshot data.",
        },
        {
          status: 400,
        }
      );
    }

    /*
     * =========================================
     * SCREENSHOT FINGERPRINT
     *
     * Same screenshot = same fingerprint
     *
     * Therefore:
     *
     * Casual      -> consumes 1
     * Romantic    -> consumes 0
     * Funny       -> consumes 0
     *
     * New screenshot -> consumes 1
     * =========================================
     */

    const fingerprint =
      createScreenshotFingerprint(
        cleanImage
      );

    const screenshotUsageKey =
      getScreenshotUsageKey(
        userId,
        fingerprint
      );

    /*
     * =========================================
     * GEMINI REQUEST
     * =========================================
     */

    let finalData = null;
    let lastError = "";

    for (
      const model of MODELS
    ) {
      let attempt = 0;
      const maxAttempts = 2;

      while (
        attempt < maxAttempts
      ) {
        attempt++;

        try {
          console.log(
            `ReplyAI: trying ${model}, attempt ${attempt}`
          );

          const response =
            await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
              {
                method: "POST",

                headers: {
                  "Content-Type":
                    "application/json",

                  "x-goog-api-key":
                    process.env
                      .GEMINI_API_KEY,
                },

                body: JSON.stringify({
                  contents: [
                    {
                      parts: [
                        {
                          inlineData: {
                            mimeType:
                              finalMimeType,
                            data:
                              cleanImage,
                          },
                        },
                        {
                          text:
                            buildPrompt(
                              tone
                            ),
                        },
                      ],
                    },
                  ],

                  generationConfig: {
                    responseMimeType:
                      "application/json",
                    temperature: 0.8,
                  },
                }),
              }
            );

          if (!response.ok) {
            const errorText =
              await response.text();

            lastError =
              errorText;

            console.error(
              `Gemini ${model} error:`,
              errorText
            );

            if (
              isTemporaryError(
                response.status,
                errorText
              ) &&
              attempt <
                maxAttempts
            ) {
              await new Promise(
                (resolve) =>
                  setTimeout(
                    resolve,
                    900
                  )
              );

              continue;
            }

            break;
          }

          finalData =
            await response.json();

          break;
        } catch (error) {
          lastError =
            error?.message ||
            "Gemini request failed.";

          console.error(
            `Gemini ${model} request failed:`,
            error
          );

          if (
            attempt <
            maxAttempts
          ) {
            await new Promise(
              (resolve) =>
                setTimeout(
                  resolve,
                  900
                )
            );

            continue;
          }
        }
      }

      if (finalData) {
        break;
      }
    }

    /*
     * =========================================
     * ALL MODELS FAILED
     * =========================================
     */

    if (!finalData) {
      console.error(
        "All Gemini models failed:",
        lastError
      );

      const response =
        NextResponse.json(
          {
            error:
              "Our AI service is temporarily busy. Please try again in a moment.",
          },
          {
            status: 503,
          }
        );

      response.cookies.set(
        "replyai_user_id",
        userId,
        {
          httpOnly: true,
          secure:
            process.env.NODE_ENV ===
            "production",
          sameSite: "lax",
          maxAge:
            60 * 60 * 24 * 365,
          path: "/",
        }
      );

      return response;
    }

    /*
     * =========================================
     * READ AI RESPONSE
     * =========================================
     */

    const text =
      finalData?.candidates?.[0]
        ?.content?.parts?.[0]
        ?.text;

    if (!text) {
      return NextResponse.json(
        {
          error:
            "AI returned an empty response. Please try again.",
        },
        {
          status: 500,
        }
      );
    }

    let parsed;

    try {
      parsed =
        JSON.parse(text);
    } catch (error) {
      console.error(
        "Invalid Gemini JSON:",
        text
      );

      return NextResponse.json(
        {
          error:
            "AI returned an invalid response. Please try again.",
        },
        {
          status: 500,
        }
      );
    }

    const replies =
      Array.isArray(
        parsed?.replies
      )
        ? parsed.replies
            .filter(
              (reply) =>
                typeof reply ===
                "string"
            )
            .slice(0, 3)
        : [];

    if (
      replies.length === 0
    ) {
      return NextResponse.json(
        {
          error:
            "No replies were generated. Please try again.",
        },
        {
          status: 500,
        }
      );
    }

    /*
     * =========================================
     * SUCCESS
     *
     * Atomically consume one reply ONLY
     * if this screenshot has never consumed
     * one before.
     * =========================================
     */

    const usageResult =
      await consumeReplyOnce(
        repliesKey,
        screenshotUsageKey
      );

    /*
     * Same screenshot was already charged.
     *
     * Tone change:
     * No additional usage.
     */

    if (
      Number(usageResult) === -1
    ) {
      repliesRemaining =
        Number(
          await redis.get(
            repliesKey
          )
        );

    } else if (
      Number(usageResult) === 0
    ) {
      /*
       * No replies available.
       */

      const response =
        NextResponse.json(
          {
            error:
              "You've used all your free replies.",
            code:
              "NO_REPLIES_LEFT",
            repliesRemaining: 0,
          },
          {
            status: 402,
          }
        );

      response.cookies.set(
        "replyai_user_id",
        userId,
        {
          httpOnly: true,
          secure:
            process.env.NODE_ENV ===
            "production",
          sameSite: "lax",
          maxAge:
            60 * 60 * 24 * 365,
          path: "/",
        }
      );

      return response;

    } else {
      /*
       * First successful generation for
       * this screenshot.
       */

      repliesRemaining =
        Number(
          usageResult
        );

      await redis.incr(
        totalGeneratedKey
      );

      /*
       * Keep user record compatible
       * with the existing database structure.
       */

      await redis.set(
        userKey,
        {
          ...user,
          repliesRemaining,
          totalGenerated:
            Number(
              user.totalGenerated ??
                0
            ) + 1,
          lastGeneratedAt:
            new Date().toISOString(),
        }
      );
    }

    /*
     * =========================================
     * RESPONSE
     * =========================================
     */

    const response =
      NextResponse.json({
        replies,
        repliesRemaining,
      });

    response.cookies.set(
      "replyai_user_id",
      userId,
      {
        httpOnly: true,
        secure:
          process.env.NODE_ENV ===
          "production",
        sameSite: "lax",
        maxAge:
          60 * 60 * 24 * 365,
        path: "/",
      }
    );

    return response;

  } catch (error) {
    console.error(
      "ReplyAI generate error:",
      error
    );

    const response =
      NextResponse.json(
        {
          error:
            "Something went wrong. Please try again.",
        },
        {
          status: 500,
        }
      );

    if (userId) {
      response.cookies.set(
        "replyai_user_id",
        userId,
        {
          httpOnly: true,
          secure:
            process.env.NODE_ENV ===
            "production",
          sameSite: "lax",
          maxAge:
            60 * 60 * 24 * 365,
          path: "/",
        }
      );
    }

    return response;
  }
}