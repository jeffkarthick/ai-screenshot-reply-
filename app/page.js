"use client";

import { useRef, useState } from "react";

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

  // Store base64 so we don't convert the same
  // screenshot again every time a tone changes.
  const [imageBase64, setImageBase64] = useState("");

  // Store generated replies per tone.
  const [toneCache, setToneCache] = useState({});

  // Used to automatically scroll to results.
  const resultsRef = useRef(null);

  // Prevent duplicate requests.
  const requestInProgress = useRef(false);

  // ==========================================
  // HANDLE FILE
  // ==========================================

  async function handleFile(file) {
    if (!file) return;

    setError("");
    setReplies([]);
    setCopied(null);
    setReadyMessage("");
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

      if (preview) {
        URL.revokeObjectURL(preview);
      }

      setPreview(URL.createObjectURL(file));

    } catch (err) {
      console.error(err);

      setError(
        "Unable to read the screenshot. Please try again."
      );
    }
  }

  function handleInput(event) {
    const file = event.target.files?.[0];

    handleFile(file);

    // Allows selecting the same image again.
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
    setCopied(null);
  }

  // ==========================================
  // SCROLL TO RESULTS
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

  async function generateReplies(selectedTone = tone) {
    if (!image || !imageBase64) {
      setError("Please upload a screenshot first.");
      return;
    }

    // Don't allow duplicate requests.
    if (requestInProgress.current) {
      return;
    }

    // ========================================
    // USE CACHE IF AVAILABLE
    // ========================================

    if (
      toneCache[selectedTone] &&
      Array.isArray(toneCache[selectedTone]) &&
      toneCache[selectedTone].length > 0
    ) {
      setTone(selectedTone);
      setReplies(toneCache[selectedTone]);
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

      // ========================================
      // API REQUEST
      // ========================================

      const response = await fetch(
        "/api/generate",
        {
          method: "POST",

          headers: {
            "Content-Type": "application/json",
          },

          body: JSON.stringify({
            image: imageBase64,
            mimeType: image.type,
            tone: selectedTone,
          }),
        }
      );

      const data = await response.json();

      // ========================================
      // API ERROR
      // ========================================

      if (!response.ok) {
        console.error(
          "Generate API error:",
          data
        );

        throw new Error(
  data?.error ||
  "Unable to generate replies. Please try again."
);
      }

      // ========================================
      // VALIDATE RESPONSE
      // ========================================

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

      // ========================================
      // SAVE RESULT
      // ========================================

      setTone(selectedTone);

      setReplies(data.replies);

      // Cache this tone.
      setToneCache((previous) => ({
        ...previous,
        [selectedTone]: data.replies,
      }));

      // ========================================
      // SUCCESS MESSAGE
      // ========================================

      setReadyMessage(
        `${selectedTone} replies are ready`
      );

      // ========================================
      // AUTO SCROLL
      // ========================================

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

  async function handleToneChange(newTone) {
    if (!image || !imageBase64) {
      setError(
        "Please upload a screenshot first."
      );
      return;
    }

    if (loading) {
      return;
    }

    setError("");
    setTone(newTone);

    await generateReplies(newTone);
  }

  // ==========================================
  // COPY
  // ==========================================

  async function copyReply(text, index) {
    try {
      await navigator.clipboard.writeText(text);

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
            UPLOAD
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
            SUCCESS
        ====================================== */}

        {readyMessage && (
          <div className="successBox">
            ✓ {readyMessage}
          </div>
        )}


        {/* ======================================
            TONES
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
                disabled={
                  loading || !image
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


        {/* ======================================
            GENERATE
        ====================================== */}

        <button
          type="button"
          className="generateButton"
          onClick={() =>
            generateReplies(tone)
          }
          disabled={
            loading || !image
          }
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
   FILE → BASE64
   ========================================== */

function fileToBase64(file) {
  return new Promise(
    (resolve, reject) => {

      const reader =
        new FileReader();

      reader.onload = () => {

        const result =
          reader.result;

        if (
          typeof result !== "string"
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