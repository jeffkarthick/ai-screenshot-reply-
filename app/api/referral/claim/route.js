import { NextResponse } from "next/server";
import crypto from "crypto";
import { cookies } from "next/headers";
import { redis } from "../../../../lib/upstash";

export const runtime = "nodejs";

const USER_COOKIE =
  "replyai_user_id";

const STARTING_REPLIES = 5;

// One owner can receive rewards
// from max 10 qualifying visitors
// in a rolling 24-hour window.
const DAILY_VISITOR_LIMIT = 10;

async function ensureUser(
  userId
) {
  const repliesKey =
    `replyai:replies:${userId}`;

  const current =
    await redis.get(
      repliesKey
    );

  if (
    current !== null &&
    current !== undefined
  ) {
    return Number(current);
  }

  const user =
    await redis.get(
      `replyai:user:${userId}`
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

  const balance =
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
    balance
  );

  return balance;
}

export async function GET(req) {
  try {
    const { searchParams } =
      new URL(req.url);

    const code =
      searchParams.get(
        "ref"
      );

    const requestedType =
      searchParams.get(
        "type"
      );

    if (!code) {
      return NextResponse.json(
        {
          rewardGranted: false,
          repliesRemaining:
            null,
        },
        {
          status: 400,
        }
      );
    }

    // --------------------------------------
    // GET REFERRAL
    // --------------------------------------

    const referral =
      await redis.get(
        `replyai:ref:${code}`
      );

    if (
      !referral ||
      typeof referral !==
        "object"
    ) {
      return NextResponse.json({
        rewardGranted: false,
        repliesRemaining:
          null,
      });
    }

    const ownerUserId =
      referral.ownerUserId;

    const type =
      referral.type ===
      "reply" ||
      referral.type === "site"
        ? referral.type
        : requestedType ===
          "reply"
        ? "reply"
        : "site";

    // --------------------------------------
    // CURRENT VISITOR
    // --------------------------------------

    const cookieStore =
      cookies();

    let visitorUserId =
      cookieStore.get(
        USER_COOKIE
      )?.value;

    let isNewVisitor = false;

    if (!visitorUserId) {
      visitorUserId =
        crypto.randomUUID();

      isNewVisitor = true;
    }

    // --------------------------------------
    // INITIALIZE VISITOR
    // --------------------------------------

    await ensureUser(
      visitorUserId
    );

    // --------------------------------------
    // SELF-REFERRAL
    // --------------------------------------

    if (
      visitorUserId ===
      ownerUserId
    ) {
      const balance =
        await ensureUser(
          visitorUserId
        );

      const response =
        NextResponse.json({
          rewardGranted: false,
          rewardAmount: 0,
          repliesRemaining:
            balance,
          reason:
            "self_referral",
        });

      if (isNewVisitor) {
        response.cookies.set(
          USER_COOKIE,
          visitorUserId,
          {
            httpOnly: true,
            secure:
              process.env.NODE_ENV ===
              "production",
            sameSite: "lax",
            maxAge:
              60 *
              60 *
              24 *
              365,
            path: "/",
          }
        );
      }

      return response;
    }

    // --------------------------------------
    // ONE VISITOR = ONE REWARD TO ONE OWNER
    // --------------------------------------

    const claimKey =
      `replyai:refclaim:${ownerUserId}:${visitorUserId}`;

    // --------------------------------------
    // DAILY OWNER LIMIT
    // --------------------------------------

    const day =
      new Date()
        .toISOString()
        .slice(0, 10);

    const dailyKey =
      `replyai:refdaily:${ownerUserId}:${day}`;

    const ownerRepliesKey =
      `replyai:replies:${ownerUserId}`;

    await ensureUser(
      ownerUserId
    );

    const rewardAmount =
      type === "reply"
        ? 10
        : 5;

    // --------------------------------------
    // ATOMIC CLAIM
    // --------------------------------------

    const script = `
      local dailyCount =
        tonumber(redis.call("GET", KEYS[2]) or "0")

      if dailyCount >= tonumber(ARGV[2]) then
        return -2
      end

      local claimed =
        redis.call(
          "SET",
          KEYS[1],
          "1",
          "NX",
          "EX",
          ARGV[3]
        )

      if not claimed then
        return 0
      end

      local nextDaily =
        redis.call(
          "INCR",
          KEYS[2]
        )

      if nextDaily == 1 then
        redis.call(
          "EXPIRE",
          KEYS[2],
          ARGV[4]
        )
      end

      local newBalance =
        redis.call(
          "INCRBY",
          KEYS[3],
          ARGV[1]
        )

      return newBalance
    `;

    const result =
      await redis.eval(
        script,
        [
          claimKey,
          dailyKey,
          ownerRepliesKey,
        ],
        [
          rewardAmount,
          DAILY_VISITOR_LIMIT,
          60 *
            60 *
            24 *
            30,
          60 *
            60 *
            24,
        ]
      );

    const numericResult =
      Number(result);

    // --------------------------------------
    // DAILY LIMIT
    // --------------------------------------

    if (
      numericResult ===
      -2
    ) {
      const visitorBalance =
        await ensureUser(
          visitorUserId
        );

      const response =
        NextResponse.json({
          rewardGranted: false,
          rewardAmount: 0,
          repliesRemaining:
            visitorBalance,
          reason:
            "daily_limit",
        });

      if (isNewVisitor) {
        response.cookies.set(
          USER_COOKIE,
          visitorUserId,
          {
            httpOnly: true,
            secure:
              process.env.NODE_ENV ===
              "production",
            sameSite: "lax",
            maxAge:
              60 *
              60 *
              24 *
              365,
            path: "/",
          }
        );
      }

      return response;
    }

    // --------------------------------------
    // ALREADY CLAIMED
    // --------------------------------------

    if (
      numericResult ===
      0
    ) {
      const visitorBalance =
        await ensureUser(
          visitorUserId
        );

      const response =
        NextResponse.json({
          rewardGranted: false,
          rewardAmount: 0,
          repliesRemaining:
            visitorBalance,
          reason:
            "already_claimed",
        });

      if (isNewVisitor) {
        response.cookies.set(
          USER_COOKIE,
          visitorUserId,
          {
            httpOnly: true,
            secure:
              process.env.NODE_ENV ===
              "production",
            sameSite: "lax",
            maxAge:
              60 *
              60 *
              24 *
              365,
            path: "/",
          }
        );
      }

      return response;
    }

    // --------------------------------------
    // SUCCESS
    // --------------------------------------

    const visitorBalance =
      await ensureUser(
        visitorUserId
      );

    const response =
      NextResponse.json({
        rewardGranted: true,
        rewardAmount,
        repliesRemaining:
          visitorBalance,
        ownerBalance:
          numericResult,
      });

    if (isNewVisitor) {
      response.cookies.set(
        USER_COOKIE,
        visitorUserId,
        {
          httpOnly: true,
          secure:
            process.env.NODE_ENV ===
            "production",
          sameSite: "lax",
          maxAge:
            60 *
            60 *
            24 *
            365,
          path: "/",
        }
      );
    }

    return response;
  } catch (error) {
    console.error(
      "Referral claim error:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to process referral.",
        rewardGranted: false,
      },
      {
        status: 500,
      }
    );
  }
}