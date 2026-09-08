export default function AboutPage() {
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

        <h1>About ReplyAI</h1>

        <p className="lead">
          ReplyAI is an AI-powered reply assistant designed to help you
          understand conversations and create natural reply suggestions
          from screenshots.
        </p>

        <section className="infoSection">
          <h2>What is ReplyAI?</h2>
          <p>
            Sometimes it can be difficult to know what to say next in a
            conversation. ReplyAI helps by analyzing the visible
            conversation in an uploaded screenshot and generating
            possible replies based on the context and tone you choose.
          </p>
        </section>

        <section className="infoSection">
          <h2>How it works</h2>
          <p>
            Upload a screenshot, choose a reply style, and let the AI
            generate suggestions. You can then copy the reply that best
            fits your conversation.
          </p>
        </section>

        <section className="infoSection">
          <h2>Our goal</h2>
          <p>
            Our goal is to make replying to messages easier, faster and
            more natural while keeping the experience simple.
          </p>
        </section>

        <div className="infoFooter">
          © 2026 ReplyAI. All rights reserved.
        </div>

      </div>
    </main>
  );
}