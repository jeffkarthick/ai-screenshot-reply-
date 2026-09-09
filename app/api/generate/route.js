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
 * ============================================================
 * SECURITY SETTINGS
 * ============================================================
 */

/*
 * Maximum screenshot size:
 * Base64 is larger than the original image,
 * so 8 MB base64 allows normal phone screenshots
 * while blocking extremely large payloads.
 */
const MAX_IMAGE_BASE64_LENGTH = 8 * 1024 * 1024;

/*
 * Maximum API requests from one IP in one minute.
 *
 * This protects Gemini from automated spam.
 */
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW = 60;

/*
 * Keep screenshot fingerprints for 90 days.
 * This prevents the same screenshot from being charged
 * repeatedly while avoiding unlimited Redis growth.
 */
const SCREENSHOT_USAGE_TTL = 60 * 60 * 24 * 90;

/*
 * ============================================================
 * PROMPT
 * ============================================================
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

/*
 * ============================================================
 * USER / REDIS KEYS
 * ============================================================
 */

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

function getRateLimitKey(ipHash) {
  return `replyai:ratelimit:${ipHash}`;
}

/*
 * ============================================================
 * IP HASH
 *
 * We don't store the raw IP address in Redis.
 * ============================================================
 */

function getClientIp(req) {
  const forwardedFor =
    req.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0].trim();
  }

  const realIp =
    req.headers.get("x-real-ip");

  if (realIp) {
    return realIp.trim();
  }

  return "unknown";
}

function hashIp(ip) {
  return crypto
    .createHash("sha256")
    .update(ip)
    .digest("hex");
}

/*
 * ============================================================
 * RATE LIMIT
 *
 * Atomic Redis operation.
 *
 * Result:
 * > RATE_LIMIT_MAX = blocked
 * otherwise allowed
 * ============================================================
 */

async function checkRateLimit(ipHash) {
  const key = getRateLimitKey(ipHash);

  const script = `
    local count = redis.call(
      "INCR",
      KEYS[1]
    )

    if count == 1 then
      redis.call(
        "EXPIRE",
        KEYS[1],
        ARGV[1]
      )
    end

    return count
  `;

  const count = await redis.eval(
    script,
    [key],
    [String(RATE_LIMIT_WINDOW)]
  );

  return Number(count);
}

/*
 * ============================================================
 * BASE64 CLEANING
 * ============================================================
 */

function cleanBase64Image(image) {
  if (!image || typeof image !== "string") {
    return "";
  }

  if (image.includes(",")) {
    return image.split(",")[1];
  }

  return image;
}

/*
 * ============================================================
 * BASE64 VALIDATION
 * ============================================================
 */

function isValidBase64Image(image) {
  if (!image || typeof image !== "string") {
    return false;
  }

  /*
   * Base64 should only contain valid characters.
   */
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(image)) {
    return false;
  }

  /*
   * Base64 length should be divisible by 4.
   */
  if (image.length % 4 !== 0) {
    return false;
  }

  return true;
}

/*
 * ============================================================
 * SCREENSHOT FINGERPRINT
 * ============================================================
 */

function createScreenshotFingerprint(image) {
  return crypto
    .createHash("sha256")
    .update(image)
    .digest("hex");
}

/*
 * ============================================================
 * TEMPORARY ERROR DETECTION
 * ============================================================
 */

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
 *
 * Screenshot usage key gets a 90-day TTL.
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
      "1",
      "EX",
      ARGV[1]
    )

    return newRemaining
  `;

  return await redis.eval(
    script,
    [
      repliesKey,
      screenshotUsageKey,
    ],
    [
      String(SCREENSHOT_USAGE_TTL),
    ]
  );
}

/*
 * ============================================================
 * GEMINI REQUEST
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

      maxOutputTokens: 300,

      temperature: 0.8,
    };

    /*
     * Gemini 3.x:
     * Lower thinking = lower latency.
     *
     * Gemini 2.5 does not receive this setting.
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

            /*
             * IMPORTANT:
             * API key stays server-side.
             */
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

/*
 * ============================================================
 * POST
 * ============================================================
 */

export async function POST(req) {
  let userId = null;

  try {
    /*
     * ========================================================
     * RATE LIMIT
     * ========================================================
     */

    const clientIp =
      getClientIp(req);

    const ipHash =
      hashIp(clientIp);

    let requestCount;

    try {
      requestCount =
        await checkRateLimit(
          ipHash
        );
    } catch (rateLimitError) {
      /*
       * If Redis rate-limit operation itself fails,
       * don't expose internal error details.
       *
       * Continue normally because the main Redis
       * usage system still protects the user.
       */
      console.error(
        "Rate limit error:",
        rateLimitError
      );

      requestCount = 0;
    }

    if (
      requestCount >
      RATE_LIMIT_MAX
    ) {
      return NextResponse.json(
        {
          error:
            "Too many requests. Please wait a moment and try again.",
          code:
            "RATE_LIMITED",
        },
        {
          status: 429,
          headers: {
            "Retry-After":
              String(
                RATE_LIMIT_WINDOW
              ),
          },
        }
      );
    }

    /*
     * ========================================================
     * READ REQUEST
     * ========================================================
     */

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

    if (
      !image ||
      typeof image !== "string"
    ) {
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

    /*
     * Prevent extremely large image payloads.
     */
    if (
      image.length >
      MAX_IMAGE_BASE64_LENGTH
    ) {
      return NextResponse.json(
        {
          error:
            "Screenshot is too large. Please upload a smaller image.",
        },
        {
          status: 413,
        }
      );
    }

    /*
     * ========================================================
     * GEMINI CONFIG CHECK
     * ========================================================
     */

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

    /*
     * Only accept a reasonably-sized UUID-like cookie.
     * This avoids storing arbitrary huge values as Redis keys.
     */
    if (
      existingUserId &&
      existingUserId.length >
        100
    ) {
      userId =
        createUserId();
    } else {
      userId =
        existingUserId ||
        createUserId();
    }

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
      typeof mimeType ===
        "string" &&
      mimeType.length <= 100
        ? mimeType
        : "image/jpeg";

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

    /*
     * Clean data URL if frontend sends:
     * data:image/png;base64,...
     */
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
     * Validate base64.
     */
    if (
      !isValidBase64Image(
        cleanImage
      )
    ) {
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
     * Re-check cleaned image size.
     */
    if (
      cleanImage.length >
      MAX_IMAGE_BASE64_LENGTH
    ) {
      return NextResponse.json(
        {
          error:
            "Screenshot is too large. Please upload a smaller image.",
        },
        {
          status: 413,
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
     * Existing model order is preserved.
     * One attempt per model.
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
       * Immediately try next model.
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
    /*
     * Never expose internal server errors
     * to the public client.
     */
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