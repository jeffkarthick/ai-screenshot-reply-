"use client";

import { useState } from "react";

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

  // ==========================================
  // HANDLE FILE
  // ==========================================

  function handleFile(file) {
    if (!file) return;

    setError("");
    setReplies([]);
    setCopied(null);

    if (!file.type.startsWith("image/")) {
      setError("Please upload an image file.");
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setError("Image must be smaller than 10MB.");
      return;
    }

    // Revoke old preview if one exists
    if (preview) {
      URL.revokeObjectURL(preview);
    }

    setImage(file);
    setPreview(URL.createObjectURL(file));
  }

  function handleInput(event) {
    const file = event.target.files?.[0];

    handleFile(file);

    // Allow selecting the same image again
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
    setReplies([]);
    setError("");
    setCopied(null);
    setTone("Casual");
  }

  // ==========================================
  // GENERATE REPLIES
  // ==========================================

  async function generateReplies(selectedTone = tone) {
    if (!image) {
      setError("Please upload a screenshot first.");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setCopied(null);

      // IMPORTANT:
      // Do NOT clear previous replies here.
      // This keeps the UI stable while changing tone.

      const base64 = await fileToBase64(image);

      const response = await fetch("/api/generate", {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
        },

        body: JSON.stringify({
          image: base64,
          mimeType: image.type,
          tone: selectedTone,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        console.error("Generate API error:", data);

        throw new Error(
          data?.error ||
            "Unable to generate replies."
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

      if (data.replies.length === 0) {
        throw new Error(
          "No replies were generated."
        );
      }

      setReplies(data.replies);
      setTone(selectedTone);

    } catch (err) {
      console.error("Generate error:", err);

      setError(
        err?.message ||
          "Something went wrong. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  // ==========================================
  // TONE CHANGE
  // ==========================================

  async function handleToneChange(newTone) {
    if (!image) {
      setTone(newTone);
      setError("Please upload a screenshot first.");
      return;
    }

    // Change selected tone immediately
    setTone(newTone);

    // Automatically regenerate using
    // the SAME uploaded screenshot.
    await generateReplies(newTone);
  }

  // ==========================================
  // COPY REPLY
  // ==========================================

  async function copyReply(text, index) {
    try {
      await navigator.clipboard.writeText(text);

      setCopied(index);

      setTimeout(() => {
        setCopied(null);
      }, 1500);
    } catch {
      setError("Unable to copy the reply.");
    }
  }

  return (
    <main className="page">

      {/* ========================================
          NAVBAR
      ======================================== */}

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

      {/* ========================================
          HERO
      ======================================== */}

      <section className="hero">

        <div className="badge">
          ✨ AI-powered reply assistant
        </div>

        <h1>
          What should I
          <span> reply?</span>
        </h1>

        <p className="subtitle">
          Upload a screenshot of your conversation
          and get natural replies in seconds.
        </p>

        {/* ======================================
            UPLOAD CARD
        ====================================== */}

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
                Tap to choose an image from your phone
              </p>

              <span className="fileHint">
                PNG, JPG, WEBP or HEIC · Max 10MB
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
                  onClick={removeImage}
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

        {/* ======================================
            ERROR
        ====================================== */}

        {error && (
          <div className="errorBox">
            {error}
          </div>
        )}

        {/* ======================================
            TONE
        ====================================== */}

        <div className="toneSection">

          <div className="sectionTitle">
            Choose your vibe
          </div>

          <div className="toneGrid">

            {tones.map((item) => (

              <button
                type="button"
                key={item.name}
                onClick={() =>
                  handleToneChange(item.name)
                }
                disabled={loading || !image}
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

        {/* ======================================
            GENERATE BUTTON
        ====================================== */}

        <button
          type="button"
          className="generateButton"
          onClick={() => generateReplies(tone)}
          disabled={loading || !image}
        >

          {loading ? (

            <>
              <span className="spinner"></span>
              Understanding screenshot...
            </>

          ) : (

            <>
              ✨ Generate Replies
            </>

          )}

        </button>

        {/* ======================================
            RESULTS
        ====================================== */}

        {replies.length > 0 && (

          <section className="results">

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
                (reply, index) => (

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

                      {copied === index
                        ? "✓ Copied"
                        : "Copy"}

                    </button>

                  </div>

                )
              )}

            </div>

          </section>

        )}

      </section>

      {/* ========================================
          HOW IT WORKS
      ======================================== */}

      <section
        id="how"
        className="howSection"
      >

        <h2>
          Simple. Fast. Natural.
        </h2>

        <div className="steps">

          <div className="step">

            <div>
              📸
            </div>

            <h3>
              Upload
            </h3>

            <p>
              Upload a screenshot
              of your conversation.
            </p>

          </div>

          <div className="step">

            <div>
              🧠
            </div>

            <h3>
              AI understands
            </h3>

            <p>
              AI reads the conversation
              and understands the context
              and language.
            </p>

          </div>

          <div className="step">

            <div>
              💬
            </div>

            <h3>
              Get your reply
            </h3>

            <p>
              Choose your vibe and get
              ready-to-send replies.
            </p>

          </div>

        </div>

      </section>

      {/* ========================================
          FOOTER
      ======================================== */}

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
          Your screenshot is processed temporarily
          to generate replies.
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
   CONVERT IMAGE TO BASE64
   ========================================== */

function fileToBase64(file) {
  return new Promise(
    (resolve, reject) => {

      const reader = new FileReader();

      reader.onload = () => {

        const result = reader.result;

        if (typeof result !== "string") {
          reject(
            new Error(
              "Unable to read image."
            )
          );

          return;
        }

        const parts = result.split(",");

        if (parts.length < 2) {
          reject(
            new Error(
              "Invalid image data."
            )
          );

          return;
        }

        resolve(parts[1]);
      };

      reader.onerror = () => {
        reject(
          new Error(
            "Unable to read image."
          )
        );
      };

      reader.readAsDataURL(file);
    }
  );
}