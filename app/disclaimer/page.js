export default function DisclaimerPage() {
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

        <h1>Disclaimer</h1>

        <p className="updated">
          Last updated: September 8, 2026
        </p>

        <section className="infoSection">
          <h2>AI-generated suggestions</h2>
          <p>
            ReplyAI provides AI-generated message suggestions for
            convenience and entertainment. The suggestions are not
            guaranteed to be accurate, appropriate or suitable for every
            situation.
          </p>
        </section>

        <section className="infoSection">
          <h2>Review before sending</h2>
          <p>
            Always review an AI-generated reply before sending it to
            another person. You are responsible for the messages you
            choose to send.
          </p>
        </section>

        <section className="infoSection">
          <h2>No guaranteed outcome</h2>
          <p>
            ReplyAI does not guarantee that using a particular reply
            will result in a specific response, relationship outcome,
            business result or other outcome.
          </p>
        </section>

        <section className="infoSection">
          <h2>Third-party AI services</h2>
          <p>
            ReplyAI may use third-party AI technology to process
            screenshots and generate suggestions. Availability and
            performance may depend on those third-party services.
          </p>
        </section>

        <section className="infoSection">
          <h2>Your responsibility</h2>
          <p>
            You are responsible for ensuring that your use of ReplyAI
            complies with applicable laws and that you have appropriate
            permission to use any private or personal conversation
            content that you upload.
          </p>
        </section>

        <div className="infoFooter">
          © 2026 ReplyAI. All rights reserved.
        </div>

      </div>
    </main>
  );
}