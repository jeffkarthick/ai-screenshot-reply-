export default function HowItWorksPage() {
  return (
    <main className="infoPage">
      <div className="infoContainer">

        <a href="/" className="backLink">
          ← Back to ReplyAI
        </a>

        <div className="infoBrand">
          <div className="brandIcon">R</div>
          <span>ReplyAI</span>
        </div>

        <h1>How It Works</h1>

        <p className="lead">
          ReplyAI turns a conversation screenshot into ready-to-send
          reply suggestions in a few simple steps.
        </p>

        <div className="infoSteps">

          <div className="infoStep">
            <div className="infoStepNumber">1</div>
            <div>
              <h2>Upload a screenshot</h2>
              <p>
                Select a screenshot of the conversation you want help
                replying to.
              </p>
            </div>
          </div>

          <div className="infoStep">
            <div className="infoStepNumber">2</div>
            <div>
              <h2>Choose your vibe</h2>
              <p>
                Select a style such as Casual, Funny, Romantic,
                Professional, Polite or Confident.
              </p>
            </div>
          </div>

          <div className="infoStep">
            <div className="infoStepNumber">3</div>
            <div>
              <h2>AI understands the conversation</h2>
              <p>
                The AI analyzes the visible conversation and considers
                its context, language and tone.
              </p>
            </div>
          </div>

          <div className="infoStep">
            <div className="infoStepNumber">4</div>
            <div>
              <h2>Get suggested replies</h2>
              <p>
                ReplyAI generates multiple reply options that you can
                review and copy.
              </p>
            </div>
          </div>

        </div>

        <section className="infoSection">
          <h2>Important</h2>
          <p>
            AI-generated replies are suggestions. Always review the
            suggested message before sending it.
          </p>
        </section>

        <div className="infoFooter">
          © 2026 ReplyAI. All rights reserved.
        </div>

      </div>
    </main>
  );
}