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

/*
 * Keep this reasonably short.
 * The screenshot itself contains the conversation,
 * so we don't need a huge instruction prompt.
 */
function buildPrompt(tone) {
  return `
You are ReplyAI, an expert messaging reply assistant.

Analyze the conversation screenshot and generate exactly 3 natural reply suggestions.

Selected tone:
${tone || "Casual"}

LANGUAGE:
Use the SAME language, script and writing style shown in the screenshot.

Examples:
- Tamil script -> Tamil script
- Tanglish -> Tanglish
- English -> English
- Malayalam -> Malayalam
- Manglish -> Manglish
- Hindi -> Hindi
- Hinglish -> Hinglish
- Mixed language -> preserve the natural mix

Do NOT translate the conversation.

Preserve:
- slang
- abbreviations
- casual spelling
- emojis
- punctuation
- short forms
- texting style

The website language must not affect reply language.

Tone affects personality only, NOT language.

RULES:
- Sound natural and human.
- Keep replies reasonably short.
- Match the selected tone.
- Do not mention AI.
- Do not invent information not visible in the screenshot.
- Return ONLY valid JSON.

FORMAT:
{
  "replies": [
    "reply 1",
    "reply 2",
    "reply 3"
  ]
}
`;
}

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

/*
 * ============================================================
 * ATOMIC REPLY USAGE
 *
 * Result:
 *
 * > 0  = screenshot consumed one reply
 *   0  = no replies remaining
 *  -1  = screenshot already used
 * ============================================================
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

/*
 * ============================================================
 * GEMINI REQUEST
 *
 * Optimizations:
 *
 * 1. No unnecessary 900ms retry delay
 * 2. One attempt per model
 * 3. Low thinking for Gemini 3.x
 * 4. Small output limit
 * 5. Request timeout
 * ============================================================
 */

async function generateWithGemini(
  model,
  image,
  mimeType,
  tone
) {
  const controller =
    new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    20000
  );

  try {
    const generationConfig = {
      responseMimeType:
        "application/json",

      /*
       * Reply suggestions are short.
       * 300 tokens is more than enough.
       */
      maxOutputTokens: 300,

      /*
       * Keep your existing creative behavior.
       */
      temperature: 0.8,
    };

    /*
     * Gemini 3.x:
     * Lower thinking = lower latency.
     *
     * Gemini 2.5 does NOT support thinkingLevel,
     * so only add it for Gemini 3.x.
     */
    if (
      model.startsWith("gemini-3.")
    ) {
      generationConfig.thinkingConfig = {
        thinkingLevel: "low",
      };
    }

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

          signal:
            controller.signal,

          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    inlineData: {
                      mimeType,
                      data: image,
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

            generationConfig,
          }),
        }
      );

    if (!response.ok) {
      const errorText =
        await response.text();

      return {
        success: false,
        temporary:
          isTemporaryError(
            response.status,
            errorText
          ),
        error:
          errorText ||
          `Gemini returned ${response.status}`,
      };
    }

    const data =
      await response.json();

    return {
      success: true,
      data,
    };
  } catch (error) {
    const message =
      error?.name ===
      "AbortError"
        ? "Gemini request timed out."
        : error?.message ||
          "Gemini request failed.";

    return {
      success: false,
      temporary: true,
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(req) {
  let userId = null;

  try {
    const body =
      await req.json();

    const {
      image,
      mimeType,
      tone,
    } = body;

    /*
     * ========================================================
     * BASIC VALIDATION
     * ========================================================
     */

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

    if (
      !process.env.GEMINI_API_KEY
    ) {
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
     * ========================================================
     * USER ID
     * ========================================================
     */

    const existingUserId =
      req.cookies.get(
        "replyai_user_id"
      )?.value;

    userId =
      existingUserId ||
      createUserId();

    const userKey =
      getUserKey(userId);

    const repliesKey =
      getRepliesKey(userId);

    const totalGeneratedKey =
      getTotalGeneratedKey(userId);

    /*
     * ========================================================
     * USER RECORD
     * ========================================================
     */

    let user =
      await redis.get(
        userKey
      );

    if (!user) {
      user = {
        id: userId,

        repliesRemaining:
          STARTING_REPLIES,

        totalGenerated: 0,

        createdAt:
          new Date().toISOString(),
      };

      /*
       * These two Redis operations can run
       * at the same time.
       */
      await Promise.all([
        redis.set(
          userKey,
          user
        ),

        redis.set(
          repliesKey,
          STARTING_REPLIES,
          {
            nx: true,
          }
        ),
      ]);
    } else {
      /*
       * Migrate old users.
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
     * ========================================================
     * CURRENT REPLY COUNT
     * ========================================================
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
     * ========================================================
     * EARLY USAGE CHECK
     * ========================================================
     */

    if (
      repliesRemaining <= 0
    ) {
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
     * ========================================================
     * IMAGE VALIDATION
     * ========================================================
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
     * ========================================================
     * SCREENSHOT FINGERPRINT
     * ========================================================
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
     * ========================================================
     * GEMINI
     *
     * IMPORTANT:
     * Model versions are unchanged.
     *
     * We simply try each model once.
     * No unnecessary 900ms wait.
     * ========================================================
     */

    let finalData = null;
    let lastError = "";

    for (
      const model of MODELS
    ) {
      console.log(
        `ReplyAI: trying ${model}`
      );

      const result =
        await generateWithGemini(
          model,
          cleanImage,
          finalMimeType,
          tone
        );

      if (
        result.success
      ) {
        finalData =
          result.data;

        break;
      }

      lastError =
        result.error ||
        "Gemini request failed.";

      console.error(
        `Gemini ${model} error:`,
        lastError
      );

      /*
       * Immediately try the next model.
       *
       * No artificial 900ms delay.
       */
      continue;
    }

    /*
     * ========================================================
     * ALL MODELS FAILED
     * ========================================================
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
     * ========================================================
     * READ AI RESPONSE
     * ========================================================
     */

    const text =
      finalData
        ?.candidates?.[0]
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

    /*
     * ========================================================
     * PARSE JSON
     * ========================================================
     */

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

    /*
     * ========================================================
     * CLEAN REPLIES
     * ========================================================
     */

    const replies =
      Array.isArray(
        parsed?.replies
      )
        ? parsed.replies
            .filter(
              (reply) =>
                typeof reply ===
                  "string" &&
                reply.trim()
                  .length > 0
            )
            .map(
              (reply) =>
                reply.trim()
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
     * ========================================================
     * ATOMIC USAGE
     * ========================================================
     */

    const usageResult =
      await consumeReplyOnce(
        repliesKey,
        screenshotUsageKey
      );

    /*
     * Same screenshot:
     * do NOT charge again.
     */

    if (
      Number(
        usageResult
      ) === -1
    ) {
      repliesRemaining =
        Number(
          await redis.get(
            repliesKey
          )
        );
    }

    /*
     * No replies available.
     */

    else if (
      Number(
        usageResult
      ) === 0
    ) {
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
     * First successful generation
     * for this screenshot.
     */

    else {
      repliesRemaining =
        Number(
          usageResult
        );

      /*
       * These two Redis operations
       * are independent, so run together.
       */
      await Promise.all([
        redis.incr(
          totalGeneratedKey
        ),

        redis.set(
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
        ),
      ]);
    }

    /*
     * ========================================================
     * RESPONSE
     * ========================================================
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