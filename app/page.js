"use client"; 

import { useEffect, useRef, useState } from "react";

const tones = [
  { name: "Casual", emoji: "🙂" },
  { name: "Funny", emoji: "😂" },
  { name: "Romantic", emoji: "❤️" },
  { name: "Professional", emoji: "💼" },
  { name: "Polite", emoji: "🙏" },
  { name: "Confident", emoji: "😎" },
];

export default function Home() {
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState("");

  const [tone, setTone] = useState("Casual");
  const [replies, setReplies] = useState([]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [copied, setCopied] = useState(null);
  const [readyMessage, setReadyMessage] = useState("");

  const [imageBase64, setImageBase64] = useState("");
  const [toneCache, setToneCache] = useState({});

  // Reply balance
  const [repliesRemaining, setRepliesRemaining] = useState(5);
  const [balanceLoading, setBalanceLoading] = useState(true);

  // Share state
  const [sharing, setSharing] = useState(null);
  const [shareMessage, setShareMessage] = useState("");

  // Same screenshot session
  const [uploadSessionId, setUploadSessionId] = useState("");

  const resultsRef = useRef(null);
  const requestInProgress = useRef(false);

  // ==========================================
  // INITIALIZE USER / BALANCE / REFERRAL
  // ==========================================

  useEffect(() => {
    async function initialize() {
      try {
        const params = new URLSearchParams(
          window.location.search
        );

        const ref = params.get("ref");
        const refType = params.get("type");

        // --------------------------------------
        // CLAIM REFERRAL
        // --------------------------------------

        if (ref) {
          try {
            const claimResponse = await fetch(
              `/api/referral/claim?ref=${encodeURIComponent(
                ref
              )}&type=${encodeURIComponent(
                refType || ""
              )}`,
              {
                method: "GET",
                cache: "no-store",
              }
            );

            const claimData =
              await claimResponse.json();

            if (
              claimResponse.ok &&
              typeof claimData.repliesRemaining ===
                "number"
            ) {
              setRepliesRemaining(
                claimData.repliesRemaining
              );

              if (claimData.rewardGranted) {
                const reward =
                  claimData.rewardAmount || 0;

                setShareMessage(
                  `+${reward} replies added 🎉`
                );

                setTimeout(() => {
                  setShareMessage("");
                }, 4000);
              }
            }
          } catch (refError) {
            console.error(
              "Referral claim error:",
              refError
            );
          }

          // Remove referral query from browser URL
          window.history.replaceState(
            {},
            document.title,
            window.location.pathname
          );
        }

        // --------------------------------------
        // LOAD CURRENT BALANCE
        // --------------------------------------

        const response = await fetch(
          "/api/usage",
          {
            method: "GET",
            cache: "no-store",
          }
        );

        const data = await response.json();

        if (
          response.ok &&
          typeof data.repliesRemaining ===
            "number"
        ) {
          setRepliesRemaining(
            data.repliesRemaining
          );
        }
      } catch (err) {
        console.error(
          "Unable to load usage:",
          err
        );
      } finally {
        setBalanceLoading(false);
      }
    }

    initialize();
  }, []);

  // ==========================================
  // HANDLE FILE
  // ==========================================

  async function handleFile(file) {
    if (!file) return;

    setError("");
    setReplies([]);
    setCopied(null);
    setReadyMessage("");
    setShareMessage("");
    setTone("Casual");
    setToneCache({});

    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be smaller than 10MB.");
      return;
    }

    try {
      const base64 = await fileToBase64(file);

      setImage(file);
      setImageBase64(base64);

      const newSessionId =
        crypto.randomUUID();

      setUploadSessionId(newSessionId);

      if (preview) {
        URL.revokeObjectURL(preview);
      }

      setPreview(
        URL.createObjectURL(file)
      );
    } catch (err) {
      console.error(err);

      setError(
        "Unable to read the screenshot. Please try again."
      );
    }
  }

  function handleInput(event) {
    const file =
      event.target.files?.[0];

    handleFile(file);

    event.target.value = "";
  }

  // ==========================================
  // REMOVE IMAGE
  // ==========================================

  function removeImage() {
    if (preview) {
      URL.revokeObjectURL(preview);
    }

    setImage(null);
    setPreview("");
    setImageBase64("");

    setReplies([]);
    setToneCache({});

    setTone("Casual");

    setError("");
    setReadyMessage("");
    setShareMessage("");
    setCopied(null);

    setUploadSessionId("");
  }

  // ==========================================
  // SCROLL
  // ==========================================

  function showResults() {
    setTimeout(() => {
      resultsRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 150);
  }

  // ==========================================
  // GENERATE REPLIES
  // ==========================================

  async function generateReplies(
    selectedTone = tone
  ) {
    if (!image || !imageBase64) {
      setError(
        "Please upload a screenshot first."
      );
      return;
    }

    if (!uploadSessionId) {
      setError(
        "Please upload the screenshot again."
      );
      return;
    }

    if (repliesRemaining === 0) {
      setError(
        "You've used all your free replies."
      );
      return;
    }

    if (requestInProgress.current) {
      return;
    }

    // ========================================
    // CACHE
    // ========================================

    if (
      toneCache[selectedTone] &&
      Array.isArray(
        toneCache[selectedTone]
      ) &&
      toneCache[selectedTone].length > 0
    ) {
      setTone(selectedTone);
      setReplies(
        toneCache[selectedTone]
      );
      setError("");

      setReadyMessage(
        `${selectedTone} replies are ready`
      );

      showResults();

      setTimeout(() => {
        setReadyMessage("");
      }, 2500);

      return;
    }

    try {
      requestInProgress.current = true;

      setLoading(true);
      setError("");
      setReadyMessage("");
      setCopied(null);

      const response = await fetch(
        "/api/generate",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json",
          },
          body: JSON.stringify({
            image: imageBase64,
            mimeType: image.type,
            tone: selectedTone,

            uploadSessionId,
          }),
        }
      );

      const data =
        await response.json();

      if (!response.ok) {
        console.error(
          "Generate API error:",
          data
        );

        if (
          data?.code ===
          "NO_REPLIES_LEFT"
        ) {
          setRepliesRemaining(0);
        }

        throw new Error(
          data?.error ||
            "Unable to generate replies. Please try again."
        );
      }

      if (
        !data.replies ||
        !Array.isArray(data.replies)
      ) {
        throw new Error(
          "AI returned an invalid response."
        );
      }

      if (
        data.replies.length === 0
      ) {
        throw new Error(
          "No replies were generated."
        );
      }

      if (
        typeof data.repliesRemaining ===
        "number"
      ) {
        setRepliesRemaining(
          data.repliesRemaining
        );
      }

      setTone(selectedTone);
      setReplies(data.replies);

      setToneCache(
        (previous) => ({
          ...previous,
          [selectedTone]:
            data.replies,
        })
      );

      setReadyMessage(
        `${selectedTone} replies are ready`
      );

      showResults();

      setTimeout(() => {
        setReadyMessage("");
      }, 2500);
    } catch (err) {
      console.error(
        "Generate error:",
        err
      );

      setError(
        err?.message ||
          "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
      requestInProgress.current = false;
    }
  }

  // ==========================================
  // TONE CHANGE
  // ==========================================

  async function handleToneChange(
    newTone
  ) {
    if (!image || !imageBase64) {
      setError(
        "Please upload a screenshot first."
      );
      return;
    }

    if (loading) return;

    setError("");
    setTone(newTone);

    await generateReplies(newTone);
  }

  // ==========================================
  // COPY
  // ==========================================

  async function copyReply(
    text,
    index
  ) {
    try {
      await navigator.clipboard.writeText(
        text
      );

      setCopied(index);

      setTimeout(() => {
        setCopied(null);
      }, 1500);
    } catch {
      setError(
        "Unable to copy the reply."
      );
    }
  }

  // ==========================================
  // SHARE MY REPLY
  // +10 REPLIES FOR REFERRAL CLICK
  // ==========================================

  async function shareReply(
    reply,
    index
  ) {
    try {
      setSharing(`reply-${index}`);
      setError("");

      const code =
        await createReferralCode(
          "reply"
        );

      const shareUrl =
        `${window.location.origin}/?ref=${encodeURIComponent(
          code
        )}&type=reply`;

      const shareText =
        `I got this reply with ReplyAI:\n\n"${reply}"\n\nTry ReplyAI:\n${shareUrl}`;

      const imageFile =
        await createShareCard({
          title:
            "My Reply from ReplyAI",
          content: reply,
          footer:
            "Generated with ReplyAI",
        });

      const canShareFiles =
        typeof navigator !==
          "undefined" &&
        navigator.share &&
        navigator.canShare &&
        imageFile &&
        navigator.canShare({
          files: [imageFile],
        });

      if (canShareFiles) {
        await navigator.share({
          files: [imageFile],
          title:
            "ReplyAI — My Reply",
          text: shareText,
          url: shareUrl,
        });

        setShareMessage(
          "Shared! Your referral link is included."
        );
      } else if (
        navigator.share
      ) {
        await navigator.share({
          title:
            "ReplyAI — My Reply",
          text: shareText,
          url: shareUrl,
        });

        setShareMessage(
          "Shared! Your referral link is included."
        );
      } else {
        await navigator.clipboard.writeText(
          shareText
        );

        setShareMessage(
          "Share text copied to clipboard."
        );
      }

      setTimeout(() => {
        setShareMessage("");
      }, 4000);
    } catch (err) {
      if (
        err?.name !==
        "AbortError"
      ) {
        console.error(
          "Share error:",
          err
        );

        setError(
          "Unable to share right now. Please try again."
        );
      }
    } finally {
      setSharing(null);
    }
  }

  // ==========================================
  // SHARE REPLYAI
  // +5 REPLIES FOR REFERRAL CLICK
  // ==========================================

  async function shareReplyAI() {
    try {
      setSharing("site");
      setError("");

      const code =
        await createReferralCode(
          "site"
        );

      const shareUrl =
        `${window.location.origin}/?ref=${encodeURIComponent(
          code
        )}&type=site`;

      const shareText =
        `Don't know what to reply? 😭\n\nUpload a screenshot to ReplyAI and get natural replies instantly.\n\nTry ReplyAI:\n${shareUrl}`;

      const imageFile =
        await createShareCard({
          title:
            "Try ReplyAI",
          content:
            "Don't know what to reply?\n\nUpload a screenshot and get natural replies instantly.",
          footer:
            "Try ReplyAI",
        });

      const canShareFiles =
        typeof navigator !==
          "undefined" &&
        navigator.share &&
        navigator.canShare &&
        imageFile &&
        navigator.canShare({
          files: [imageFile],
        });

      if (canShareFiles) {
        await navigator.share({
          files: [imageFile],
          title:
            "Try ReplyAI",
          text: shareText,
          url: shareUrl,
        });

        setShareMessage(
          "Shared! Your referral link is included."
        );
      } else if (
        navigator.share
      ) {
        await navigator.share({
          title:
            "Try ReplyAI",
          text: shareText,
          url: shareUrl,
        });

        setShareMessage(
          "Shared! Your referral link is included."
        );
      } else {
        await navigator.clipboard.writeText(
          shareText
        );

        setShareMessage(
          "Share text copied to clipboard."
        );
      }

      setTimeout(() => {
        setShareMessage("");
      }, 4000);
    } catch (err) {
      if (
        err?.name !==
        "AbortError"
      ) {
        console.error(
          "Share ReplyAI error:",
          err
        );

        setError(
          "Unable to share right now. Please try again."
        );
      }
    } finally {
      setSharing(null);
    }
  }

  // ==========================================
  // UI
  // ==========================================

  return (
    <main className="page">
      {/* NAVBAR */}

      <nav className="navbar">
        <div className="brand">
          <div className="brandIcon">
            R
          </div>

          <span>
            ReplyAI
          </span>
        </div>

        <button
          type="button"
          className="navButton"
          onClick={() =>
            document
              .getElementById("how")
              ?.scrollIntoView({
                behavior: "smooth",
              })
          }
        >
          How it works
        </button>
      </nav>

      {/* HERO */}

      <section className="hero">
        <div className="badge">
          ✨ AI-powered reply assistant
        </div>

        <h1>
          What should I
          <span> reply?</span>
        </h1>

        <p className="subtitle">
          Upload a screenshot of your
          conversation and get natural
          replies in seconds.
        </p>

        {/* ====================================
            REPLY BALANCE
        ==================================== */}

        <div className="repliesCounter">
          <span className="counterIcon">
            ✨
          </span>

          <div>
            <strong>
              {balanceLoading
                ? "Checking..."
                : repliesRemaining ===
                  1
                ? "1 reply left"
                : `${repliesRemaining} replies left`}
            </strong>

            <small>
              Free replies
            </small>
          </div>
        </div>

        {/* ====================================
            SHARE REPLYAI
        ==================================== */}

        <button
          type="button"
          className="shareSiteButton"
          onClick={shareReplyAI}
          disabled={
            sharing !== null
          }
        >
          {sharing === "site"
            ? "Preparing share..."
            : "📢 Share ReplyAI · +5 replies"}
        </button>

        {/* UPLOAD */}

        <div className="card">
          {!preview ? (
            <label className="uploadArea">
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
                onChange={handleInput}
                hidden
              />

              <div className="uploadIcon">
                📸
              </div>

              <h2>
                Upload a screenshot
              </h2>

              <p>
                Tap to choose an image
                from your phone
              </p>

              <span className="fileHint">
                PNG, JPG, WEBP or HEIC ·
                Max 10MB
              </span>
            </label>
          ) : (
            <div className="previewArea">
              <div className="previewHeader">
                <span>
                  Screenshot
                </span>

                <button
                  type="button"
                  onClick={
                    removeImage
                  }
                  className="removeButton"
                >
                  Remove
                </button>
              </div>

              <img
                src={preview}
                alt="Uploaded conversation screenshot"
                className="previewImage"
              />
            </div>
          )}
        </div>

        {/* ERROR */}

        {error && (
          <div className="errorBox">
            {error}
          </div>
        )}

        {/* SUCCESS */}

        {readyMessage && (
          <div className="successBox">
            ✓ {readyMessage}
          </div>
        )}

        {/* SHARE MESSAGE */}

        {shareMessage && (
          <div className="shareSuccessBox">
            🎉 {shareMessage}
          </div>
        )}

        {/* TONES */}

        <div className="toneSection">
          <div className="sectionTitle">
            Choose your vibe
          </div>

          <div className="toneGrid">
            {tones.map((item) => (
              <button
                type="button"
                key={item.name}
                disabled={
                  loading ||
                  !image ||
                  repliesRemaining ===
                    0
                }
                onClick={() =>
                  handleToneChange(
                    item.name
                  )
                }
                className={`toneButton ${
                  tone === item.name
                    ? "active"
                    : ""
                }`}
              >
                <span>
                  {item.emoji}
                </span>

                {item.name}
              </button>
            ))}
          </div>
        </div>

        {/* GENERATE */}

        <button
          type="button"
          className="generateButton"
          onClick={() =>
            generateReplies(tone)
          }
          disabled={
            loading ||
            !image ||
            repliesRemaining === 0
          }
        >
          {loading ? (
            <>
              <span className="spinner"></span>
              Understanding
              screenshot...
            </>
          ) : (
            <>
              ✨ Generate Replies
            </>
          )}
        </button>

        {/* NO REPLIES */}

        {repliesRemaining === 0 && (
          <div className="noRepliesBox">
            <strong>
              You've used all your
              free replies.
            </strong>

            <span>
              Share ReplyAI to earn
              more replies.
            </span>

            <button
              type="button"
              onClick={
                shareReplyAI
              }
              disabled={
                sharing !== null
              }
            >
              📢 Share ReplyAI ·
              +5
            </button>
          </div>
        )}

        {/* RESULTS */}

        {replies.length > 0 && (
          <section
            ref={resultsRef}
            className="results"
          >
            <div className="resultsHeader">
              <div>
                <h2>
                  Suggested Replies
                </h2>

                <p>
                  Tone:{" "}
                  <strong>
                    {tone}
                  </strong>
                </p>
              </div>
            </div>

            <div className="replyList">
              {replies.map(
                (
                  reply,
                  index
                ) => (
                  <div
                    className="replyCard"
                    key={`${tone}-${index}`}
                  >
                    <div className="replyNumber">
                      {index + 1}
                    </div>

                    <p>
                      {reply}
                    </p>

                    <div className="replyActions">
                      <button
                        type="button"
                        className="copyButton"
                        onClick={() =>
                          copyReply(
                            reply,
                            index
                          )
                        }
                      >
                        {copied ===
                        index
                          ? "✓ Copied"
                          : "Copy"}
                      </button>

                      <button
                        type="button"
                        className="shareReplyButton"
                        onClick={() =>
                          shareReply(
                            reply,
                            index
                          )
                        }
                        disabled={
                          sharing !==
                          null
                        }
                      >
                        {sharing ===
                        `reply-${index}`
                          ? "Sharing..."
                          : "↗ Share My Reply · +10"}
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>

            {/* SHARE REPLYAI BELOW RESULTS */}

            <div className="sharePromo">
              <div className="sharePromoIcon">
                📢
              </div>

              <div>
                <strong>
                  Want more replies?
                </strong>

                <p>
                  Share ReplyAI with
                  someone and earn
                  +5 replies when
                  they open your
                  referral link.
                </p>
              </div>

              <button
                type="button"
                onClick={
                  shareReplyAI
                }
                disabled={
                  sharing !== null
                }
              >
                Share ReplyAI
              </button>
            </div>
          </section>
        )}
      </section>

      {/* HOW IT WORKS */}

      <section
        id="how"
        className="howSection"
      >
        <h2>
          Simple. Fast. Natural.
        </h2>

        <div className="steps">
          <div className="step">
            <div>📸</div>

            <h3>
              Upload
            </h3>

            <p>
              Upload a screenshot
              of your conversation.
            </p>
          </div>

          <div className="step">
            <div>🧠</div>

            <h3>
              AI understands
            </h3>

            <p>
              AI reads the
              conversation and
              understands the
              context and language.
            </p>
          </div>

          <div className="step">
            <div>💬</div>

            <h3>
              Get your reply
            </h3>

            <p>
              Choose your vibe
              and get ready-to-send
              replies.
            </p>
          </div>
        </div>
      </section>

      {/* FOOTER */}

      <footer>
        <div className="brand footerBrand">
          <div className="brandIcon">
            R
          </div>

          <span>
            ReplyAI
          </span>
        </div>

        <p>
          Your screenshot is processed
          temporarily to generate
          replies.
        </p>

        <div className="footerLinks">
          <a href="/about">
            About
          </a>

          <a href="/how-it-works">
            How It Works
          </a>

          <a href="/privacy">
            Privacy Policy
          </a>

          <a href="/terms">
            Terms & Conditions
          </a>

          <a href="/disclaimer">
            Disclaimer
          </a>

          <a href="/contact">
            Contact
          </a>
        </div>

        <div className="copyright">
          © 2026 ReplyAI. All rights reserved.
        </div>
      </footer>
    </main>
  );
}

/* ==========================================
   CREATE REFERRAL CODE
========================================== */

async function createReferralCode(
  type
) {
  const response =
    await fetch(
      "/api/referral/create",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          type,
        }),
      }
    );

  const data =
    await response.json();

  if (
    !response.ok ||
    !data.code
  ) {
    throw new Error(
      "Unable to create referral link."
    );
  }

  return data.code;
}

/* ==========================================
   CREATE BEAUTIFUL SHARE CARD
========================================== */

async function createShareCard({
  title,
  content,
  footer,
}) {
  if (
    typeof document ===
    "undefined"
  ) {
    return null;
  }

  const canvas =
    document.createElement(
      "canvas"
    );

  canvas.width = 1200;
  canvas.height = 630;

  const ctx =
    canvas.getContext("2d");

  if (!ctx) {
    return null;
  }

  // Background
  const gradient =
    ctx.createLinearGradient(
      0,
      0,
      1200,
      630
    );

  gradient.addColorStop(
    0,
    "#8f1239"
  );

  gradient.addColorStop(
    1,
    "#c72c55"
  );

  ctx.fillStyle =
    gradient;

  ctx.fillRect(
    0,
    0,
    1200,
    630
  );

  // White card
  ctx.fillStyle =
    "#ffffff";

  roundRect(
    ctx,
    70,
    65,
    1060,
    500,
    34
  );

  // Logo
  ctx.fillStyle =
    "#9b1c3d";

  ctx.beginPath();
  ctx.arc(
    135,
    135,
    38,
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.fillStyle =
    "#ffffff";

  ctx.font =
    "700 34px Arial";

  ctx.textAlign =
    "center";

  ctx.fillText(
    "R",
    135,
    147
  );

  // Brand
  ctx.fillStyle =
    "#171717";

  ctx.textAlign =
    "left";

  ctx.font =
    "700 34px Arial";

  ctx.fillText(
    "ReplyAI",
    195,
    147
  );

  // Title
  ctx.fillStyle =
    "#777777";

  ctx.font =
    "600 24px Arial";

  ctx.fillText(
    title,
    120,
    215
  );

  // Content
  ctx.fillStyle =
    "#151515";

  ctx.font =
    "700 38px Arial";

  drawWrappedText(
    ctx,
    content,
    120,
    285,
    960,
    52,
    5
  );

  // Footer
  ctx.fillStyle =
    "#9b1c3d";

  ctx.font =
    "600 22px Arial";

  ctx.fillText(
    footer,
    120,
    505
  );

  // Website
  ctx.fillStyle =
    "#777777";

  ctx.font =
    "500 18px Arial";

  ctx.fillText(
    window.location.hostname,
    120,
    535
  );

  const blob =
    await new Promise(
      (resolve) =>
        canvas.toBlob(
          resolve,
          "image/png",
          0.95
        )
    );

  if (!blob) {
    return null;
  }

  return new File(
    [blob],
    "replyai-share.png",
    {
      type: "image/png",
    }
  );
}

/* ==========================================
   CANVAS HELPERS
========================================== */

function roundRect(
  ctx,
  x,
  y,
  width,
  height,
  radius
) {
  ctx.beginPath();

  ctx.moveTo(
    x + radius,
    y
  );

  ctx.lineTo(
    x + width - radius,
    y
  );

  ctx.quadraticCurveTo(
    x + width,
    y,
    x + width,
    y + radius
  );

  ctx.lineTo(
    x + width,
    y + height - radius
  );

  ctx.quadraticCurveTo(
    x + width,
    y + height,
    x + width - radius,
    y + height
  );

  ctx.lineTo(
    x + radius,
    y + height
  );

  ctx.quadraticCurveTo(
    x,
    y + height,
    x,
    y + height - radius
  );

  ctx.lineTo(
    x,
    y + radius
  );

  ctx.quadraticCurveTo(
    x,
    y,
    x + radius,
    y
  );

  ctx.closePath();
  ctx.fill();
}

function drawWrappedText(
  ctx,
  text,
  x,
  y,
  maxWidth,
  lineHeight,
  maxLines
) {
  const words =
    String(text).split(
      /\s+/
    );

  let line = "";
  let lineCount = 0;

  for (
    let i = 0;
    i < words.length;
    i++
  ) {
    const testLine =
      line +
      (line ? " " : "") +
      words[i];

    const metrics =
      ctx.measureText(
        testLine
      );

    if (
      metrics.width >
        maxWidth &&
      line
    ) {
      ctx.fillText(
        line,
        x,
        y
      );

      lineCount++;

      if (
        lineCount >=
        maxLines
      ) {
        return;
      }

      line =
        words[i];

      y +=
        lineHeight;
    } else {
      line =
        testLine;
    }
  }

  if (
    line &&
    lineCount <
      maxLines
  ) {
    ctx.fillText(
      line,
      x,
      y
    );
  }
}

/* ==========================================
   FILE → BASE64
========================================== */

function fileToBase64(
  file
) {
  return new Promise(
    (resolve, reject) => {
      const reader =
        new FileReader();

      reader.onload =
        () => {
          const result =
            reader.result;

          if (
            typeof result !==
            "string"
          ) {
            reject(
              new Error(
                "Unable to read image."
              )
            );

            return;
          }

          const parts =
            result.split(",");

          if (
            parts.length <
            2
          ) {
            reject(
              new Error(
                "Invalid image data."
              )
            );

            return;
          }

          resolve(
            parts[1]
          );
        };

      reader.onerror =
        () => {
          reject(
            new Error(
              "Unable to read image."
            )
          );
        };

      reader.readAsDataURL(
        file
      );
    }
  );
}