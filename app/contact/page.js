export default function ContactPage() {
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

        <h1>Contact</h1>

        <p className="lead">
          Have a question, feedback or a problem with ReplyAI?
          We would love to hear from you.
        </p>

        <section className="contactCard">
          <div className="contactIcon">✉️</div>

          <h2>Get in touch</h2>

          <p>
            For support, privacy questions, feedback or other enquiries,
            please contact the ReplyAI team.
          </p>

          <a
            href="mailto:YOUR-EMAIL@example.com"
            className="contactButton"
          >
            Email ReplyAI
          </a>
        </section>

        <p className="contactNote">
          Replace the email address above with your real support email
          before publishing the website.
        </p>

        <div className="infoFooter">
          © 2026 ReplyAI. All rights reserved.
        </div>

      </div>
    </main>
  );
}