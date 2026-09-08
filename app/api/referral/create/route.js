import { NextResponse } from "next/server";
import crypto from "crypto";
import { cookies } from "next/headers";
import { redis } from "../../../../lib/upstash";

export const runtime = "nodejs";

const USER_COOKIE =
  "replyai_user_id";

const STARTING_REPLIES = 5;

export async function POST(req) {
  try {
    const body =
      await req.json();

    const type =
      body?.type;

    if (
      type !== "reply" &&
      type !== "site"
    ) {
      return NextResponse.json(
        {
          error:
            "Invalid referral type.",
        },
        {
          status: 400,
        }
      );
    }

    const cookieStore =
      cookies();

    let userId =
      cookieStore.get(
        USER_COOKIE
      )?.value;

    let isNewUser = false;

    if (!userId) {
      userId =
        crypto.randomUUID();

      isNewUser = true;
    }

    // Make sure this user has a balance
    const repliesKey =
      `replyai:replies:${userId}`;

    const existingBalance =
      await redis.get(
        repliesKey
      );

    if (
      existingBalance ===
        null ||
      existingBalance ===
        undefined
    ) {
      const user =
        await redis.get(
          `replyai:user:${userId}`
        );

      const balance =
        user &&
        typeof user ===
          "object" &&
        "repliesRemaining" in
          user
          ? Number(
              user.repliesRemaining
            )
          : STARTING_REPLIES;

      await redis.set(
        repliesKey,
        Number.isFinite(
          balance
        )
          ? Math.max(
              0,
              balance
            )
          : STARTING_REPLIES
      );
    }

    // --------------------------------------
    // UNIQUE REFERRAL CODE
    // --------------------------------------

    let code = null;

    for (let i = 0; i < 5; i++) {
      const candidate =
        crypto
          .randomBytes(6)
          .toString("base64url");

      const created =
        await redis.set(
          `replyai:ref:${candidate}`,
          {
            ownerUserId:
              userId,
            type,
            createdAt:
              new Date().toISOString(),
          },
          {
            nx: true,
            ex:
              60 *
              60 *
              24 *
              30,
          }
        );

      if (created) {
        code =
          candidate;
        break;
      }
    }

    if (!code) {
      return NextResponse.json(
        {
          error:
            "Unable to create referral link.",
        },
        {
          status: 500,
        }
      );
    }

    const response =
      NextResponse.json({
        success: true,
        code,
      });

    if (isNewUser) {
      response.cookies.set(
        USER_COOKIE,
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
  } catch (error) {
    console.error(
      "Referral create error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to create referral.",
      },
      {
        status: 500,
      }
    );
  }
}