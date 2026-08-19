export function NewsletterSignup() {
  return (
    <section
      className="newsletter-band"
      aria-labelledby="newsletter-heading"
      data-newsletter-state="not-configured"
    >
      <div>
        <p className="newsletter-kicker">Stay connected</p>
        <h2 id="newsletter-heading" className="newsletter-heading">
          Get the next update.
        </h2>
        <p className="newsletter-copy">
          Newsletter signup will open after the mailing-list handoff is
          confirmed with DonorView.
        </p>
      </div>
      <div
        className="newsletter-form-preview"
        aria-describedby="newsletter-status"
      >
        <label htmlFor="newsletter-email">Email address</label>
        <div className="newsletter-form-row">
          <input
            id="newsletter-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            disabled
          />
          <button type="button" disabled>
            Sign up
          </button>
        </div>
        <p id="newsletter-status" role="status">
          Signup is temporarily unavailable. No email address is collected on
          this page.
        </p>
      </div>
    </section>
  );
}
