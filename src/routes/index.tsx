import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { submitReview } from "@/lib/reviews.functions";

const localBusinessSchema = {
  "@context": "https://schema.org",
  "@type": "HardwareStore",
  name: "Sunburst Paints & Coatings Ltd",
  description:
    "Paint store in Nassau, Bahamas offering interior and exterior paint, roof coatings and painting supplies.",
  address: {
    "@type": "PostalAddress",
    addressLocality: "Nassau",
    addressCountry: "BS",
  },
  areaServed: "Nassau, Bahamas",
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      {
        title: "Rate Sunburst Paints & Coatings — Nassau, Bahamas Paint Store",
      },
      {
        name: "description",
        content:
          "Tell us about your visit to Sunburst Paints & Coatings Ltd in Nassau, Bahamas — interior paint, exterior paint, roof coatings and supplies. Takes 20 seconds.",
      },
      {
        property: "og:title",
        content: "Rate Sunburst Paints & Coatings — Nassau, Bahamas",
      },
      {
        property: "og:description",
        content:
          "Share quick feedback on your paint purchase at Sunburst Paints & Coatings Ltd, Nassau, Bahamas.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify(localBusinessSchema),
      },
    ],
  }),
  component: ReviewPage,
});

type Screen = "form";

function ReviewPage() {
  const send = useServerFn(submitReview);

  const [screen, setScreen] = useState<Screen>("form");
  const [rating, setRating] = useState(0);
  const [hovered, setHovered] = useState(0);
  const [useCase, setUseCase] = useState("");
  const [wouldRecommend, setWouldRecommend] = useState<boolean | null>(null);
  const [comment, setComment] = useState("");
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const activeStars = hovered || rating;

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    if (rating === 0) {
      setError("Please tap a star rating.");
      return;
    }

    if (wouldRecommend === null) {
      setError("Please let us know if you'd recommend us.");
      return;
    }

    setBusy(true);

    try {
      await send({
        data: { rating, useCase, wouldRecommend, comment, website },
      });

      // Every customer goes to Google, regardless of rating — Google's
      // policy prohibits routing only happy customers there ("review
      // gating"). Low ratings still alert the owner by email (handled
      // server-side in submitReview) so staff can follow up privately,
      // in addition to — not instead of — the public review.
      window.location.href = "https://g.page/r/CbzzVBDnQkC-EAE/review";
    } catch {
      setError("Something went wrong. Please try again.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[30rem] flex-col px-5 pb-16 pt-10">
      <header className="text-center">
        <img
          src="/sunburst-logo.png"
          alt="SunBurst Paints & Coatings — Superior Quality Paints"
          className="mx-auto w-full max-w-[280px]"
        />

        <p className="mt-4 text-[0.75rem] tracking-[0.22em] text-muted-foreground/80 uppercase">
          Nassau, Bahamas
        </p>
      </header>

      {screen === "form" && (
        <form onSubmit={handleSubmit} className="mt-9 flex flex-col gap-8">
          <h1 className="font-display text-[2rem] leading-[1.2] tracking-tight text-balance">
            How was your experience with Sunburst Paints?
          </h1>

          <Field label="Tap a star to rate your visit" required>
            <div
              className="flex justify-between gap-2"
              onMouseLeave={() => setHovered(0)}
            >
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  aria-label={`${star} star${star > 1 ? "s" : ""}`}
                  aria-pressed={rating === star}
                  onMouseEnter={() => setHovered(star)}
                  onFocus={() => setHovered(star)}
                  onBlur={() => setHovered(0)}
                  onClick={() => setRating(star)}
                  className="flex h-16 flex-1 items-center justify-center rounded-2xl border border-border bg-card transition-all duration-200 active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  style={
                    star <= activeStars
                      ? {
                          backgroundImage: "var(--gradient-sunburst)",
                          borderColor: "transparent",
                          boxShadow: "var(--shadow-soft)",
                        }
                      : undefined
                  }
                >
                  <Star filled={star <= activeStars} />
                </button>
              ))}
            </div>
          </Field>

          <Field
            label="What did you use Sunburst Paints for?"
            htmlFor="use-case"
          >
            <input
              id="use-case"
              value={useCase}
              onChange={(e) => setUseCase(e.target.value)}
              placeholder="e.g. Interior walls, Exterior paint, Roof coating"
              className="h-16 w-full rounded-2xl border border-border bg-card px-4 text-lg placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            />
          </Field>

          <Field
            label="Would you recommend us to your friends and family?"
            required
          >
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: true, label: "Yes" },
                { value: false, label: "No" },
              ].map((option) => {
                const selected = wouldRecommend === option.value;

                return (
                  <button
                    key={option.label}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setWouldRecommend(option.value)}
                    className={`h-16 rounded-2xl border text-lg font-semibold transition-all duration-200 active:scale-[0.98] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${
                      selected
                        ? "border-transparent bg-accent text-accent-foreground"
                        : "border-border bg-card text-foreground"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </Field>

          <Field
            label="How can we improve?"
            hint="Optional"
            htmlFor="improve"
          >
            <textarea
              id="improve"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={5}
              className="w-full resize-none rounded-2xl border border-border bg-card p-4 text-lg placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              placeholder="Anything we could do better?"
            />
          </Field>

          <Honeypot value={website} onChange={setWebsite} />

          {error && <p className="text-base font-medium text-destructive">{error}</p>}

          <SubmitButton busy={busy}>Submit</SubmitButton>
        </form>
      )}

      <footer className="mt-auto pt-12 text-center text-[0.68rem] tracking-[0.2em] text-muted-foreground/70 uppercase">
        Paint · Coatings · Supplies
      </footer>
    </main>
  );
}

function Field({
  label,
  hint,
  required,
  htmlFor,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  const heading = (
    <span
      id={htmlFor ? undefined : `${slug(label)}-label`}
      className="flex items-baseline gap-2 text-lg font-semibold tracking-wide text-secondary-foreground"
    >
      {label}

      {required && <span className="text-primary">*</span>}

      {hint && (
        <span className="text-sm font-normal text-muted-foreground">
          {hint}
        </span>
      )}
    </span>
  );

  if (htmlFor) {
    return (
      <div className="flex flex-col gap-3">
        <label htmlFor={htmlFor}>{heading}</label>
        {children}
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-labelledby={`${slug(label)}-label`}
      className="flex flex-col gap-3"
    >
      {heading}
      {children}
    </div>
  );
}

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function SubmitButton({
  busy,
  children,
}: {
  busy: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="flex h-[4.5rem] items-center justify-center rounded-2xl text-xl font-semibold text-primary-foreground transition-transform duration-200 active:scale-[0.98] disabled:opacity-60"
      style={{
        backgroundImage: "var(--gradient-sunburst)",
        boxShadow: "var(--shadow-soft)",
      }}
    >
      {busy ? "Sending…" : children}
    </button>
  );
}

function Honeypot({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
      <label>
        Website

        <input
          tabIndex={-1}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  );
}

function Star({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>
      <path
        d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.45 6.2 20.5l1.1-6.45-4.7-4.6 6.5-.95L12 2.6z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        className={filled ? "text-sun-foreground" : "text-muted-foreground/60"}
      />
    </svg>
  );
}

function StarRow({ count }: { count: number }) {
  return (
    <div className="flex justify-center gap-1.5 text-primary">
      {Array.from({ length: count }).map((_, index) => (
        <svg key={index} viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
          <path
            d="M12 2.6l2.9 5.9 6.5.95-4.7 4.6 1.1 6.45L12 17.45 6.2 20.5l1.1-6.45-4.7-4.6 6.5-.95L12 2.6z"
            fill="currentColor"
          />
        </svg>
      ))}
    </div>
  );
}
