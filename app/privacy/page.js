export default function PrivacyPage() {
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

        <h1>Privacy Policy</h1>

        <p className="updated">
          Last updated: September 8, 2026
        </p>

        <p className="lead">
          Your privacy matters to us. This Privacy Policy explains how
          ReplyAI processes information when you use the service.
        </p>

        <section className="infoSection">
          <h2>1. Information you provide</h2>
          <p>
            When you use ReplyAI, you may upload screenshots containing
            conversation content. The screenshot is used to understand
            the visible conversation and generate reply suggestions.
          </p>
        </section>

        <section className="infoSection">
          <h2>2. Screenshot processing</h2>
          <p>
            Screenshots are processed for the purpose of generating
            replies. ReplyAI is designed so that uploaded screenshots
            are not intentionally stored as permanent user files or
            profiles.
          </p>
          <p>
            Temporary technical processing may occur as necessary to
            complete the AI request.
          </p>
        </section>

        <section className="infoSection">
          <h2>3. AI processing</h2>
          <p>
            ReplyAI uses third-party AI services to analyze submitted
            images and generate reply suggestions. Information required
            to process your request may therefore be transmitted to the
            relevant AI service provider.
          </p>
        </section>

        <section className="infoSection">
          <h2>4. Personal information in screenshots</h2>
          <p>
            Screenshots may contain names, phone numbers, profile
            pictures or other personal information. Please only upload
            content that you are permitted to use.
          </p>
        </section>

        <section className="infoSection">
          <h2>5. Data retention</h2>
          <p>
            ReplyAI does not intentionally maintain a permanent database
            of uploaded conversation screenshots. Technical systems or
            third-party service providers may temporarily process data
            as required to provide the service.
          </p>
        </section>

        <section className="infoSection">
          <h2>6. Security</h2>
          <p>
            We take reasonable technical measures to protect the service.
            However, no internet service can guarantee absolute security.
          </p>
        </section>

        <section className="infoSection">
          <h2>7. Cookies and analytics</h2>
          <p>
            If analytics, advertising, cookies or similar technologies
            are introduced in the future, this policy may be updated to
            explain how they are used.
          </p>
        </section>

        <section className="infoSection">
          <h2>8. Children's privacy</h2>
          <p>
            ReplyAI is not intended to encourage children to submit
            private or sensitive conversation content. Users should
            follow applicable age requirements and laws when using the
            service.
          </p>
        </section>

        <section className="infoSection">
          <h2>9. Changes to this policy</h2>
          <p>
            We may update this Privacy Policy when the service,
            technology or legal requirements change. The updated version
            will be posted on this page.
          </p>
        </section>

        <section className="infoSection">
          <h2>10. Contact</h2>
          <p>
            If you have privacy-related questions, please contact us
            through the Contact page.
          </p>
        </section>

        <div className="infoFooter">
          © 2026 ReplyAI. All rights reserved.
        </div>

      </div>
    </main>
  );
}