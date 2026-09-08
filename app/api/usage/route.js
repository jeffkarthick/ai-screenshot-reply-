import { NextResponse } from "next/server";
import crypto from "crypto";
import { cookies } from "next/headers";
import { redis } from "../../../lib/upstash";

export const runtime = "nodejs";

const STARTING_REPLIES = 5;
const USER_COOKIE = "replyai_user_id";

export async function GET() {
  try {
    const cookieStore = cookies();

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

    const repliesKey =
      `replyai:replies:${userId}`;

    const userKey =
      `replyai:user:${userId}`;

    let repliesRemaining =
      await redis.get(
        repliesKey
      );

    // --------------------------------------
    // EXISTING NUMERIC BALANCE
    // --------------------------------------

    if (
      repliesRemaining !==
        null &&
      repliesRemaining !==
        undefined
    ) {
      repliesRemaining =
        Number(
          repliesRemaining
        );
    } else {
      // ------------------------------------
      // MIGRATE OLD USER RECORD
      // ------------------------------------

      const user =
        await redis.get(
          userKey
        );

      const oldBalance =
        user &&
        typeof user ===
          "object" &&
        "repliesRemaining" in
          user
          ? Number(
              user.repliesRemaining
            )
          : STARTING_REPLIES;

      repliesRemaining =
        Number.isFinite(
          oldBalance
        )
          ? Math.max(
              0,
              oldBalance
            )
          : STARTING_REPLIES;

      await redis.set(
        repliesKey,
        repliesRemaining
      );
    }

    const response =
      NextResponse.json({
        repliesRemaining,
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
      "Usage API error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to load reply balance.",
      },
      {
        status: 500,
      }
    );
  }
}