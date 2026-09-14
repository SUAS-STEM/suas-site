"use client";

import React, { useState } from "react";

export default function SponsorPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/sponsor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });

      if (!res.ok) {
        throw new Error("Request failed");
      }

      setSuccess("Thanks — your message was sent!");
      setName("");
      setEmail("");
      setMessage("");
    } catch (err) {
      console.error(err);
      setError("There was an error sending your message. Please try again later.");
    } finally {
      setLoading(false);
    }
  };

  const fieldClass =
    "w-full bg-white/5 border border-white/15 rounded-md p-4 text-white placeholder-gray-400 " +
    "transition focus:outline-none focus:border-teal-400 focus:bg-white/10 " +
    "focus:ring-1 focus:ring-teal-400/50";
  const contactCardClass =
    "contact-card group flex min-h-28 w-full flex-col items-center justify-center gap-2 rounded-xl border " +
    "border-white/10 bg-white/[0.03] p-4 text-center text-sm text-white/70 transition " +
    "duration-150 hover:border-white/30 hover:bg-white/5 " +
    "focus-visible:outline-none " +
    "focus-visible:ring-2 focus-visible:ring-teal-300 focus-visible:ring-offset-2 focus-visible:ring-offset-black";
  const contactIconClass =
    "contact-card-icon flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-teal-300/40 " +
    "bg-teal-300/10 text-teal-200 transition duration-150";
  const contactSubtitleClass = "block text-sm text-teal-200";

  return (
    <main className="min-h-screen flex flex-col items-center justify-start py-12 px-4 sm:px-6 lg:px-8 text-white font-sans">
      <style>{`
        .contact-card {
          transition: background-color 0.15s ease, border-color 0.15s ease;
        }

        .contact-card:hover,
        .contact-card:focus-visible {
          border-color: rgb(255 255 255 / 0.25);
          background-color: rgb(255 255 255 / 0.05);
        }

        .contact-card-icon {
          transition: background-color 0.15s ease;
        }

        .contact-card:hover .contact-card-icon,
        .contact-card:focus-visible .contact-card-icon {
          background-color: rgb(70 236 213 / 0.15);
        }
      `}</style>
      <div className="w-full max-w-3xl">
        <h1 className="text-6xl font-extrabold mb-3 text-left">Contact</h1>
        <p className="text-gray-300 !mb-10 max-w-2xl">
          Help send SUAS@STEM to the competition. Whether it&apos;s funding, parts, or
          mentorship, we&apos;d love to hear from you — drop us a note below and we&apos;ll get
          back to you.
        </p>

        <div className="mb-10 grid grid-cols-1 gap-3 sm:grid-cols-4 sm:gap-4">
            <a
              href="mailto:contact@suasstem.org"
              className={contactCardClass}
            >
              <span
                aria-hidden="true"
                className={`${contactIconClass} text-lg`}
              >
                @
              </span>
              <span className="min-w-0 text-center">
                <span className="block font-semibold text-white">Email</span>
                <span className={`${contactSubtitleClass} whitespace-nowrap tracking-[-0.03em]`}>
                  contact@suasstem.org
                </span>
              </span>
            </a>

            <a
              href="https://linkedin.com/company/suas-stem"
              target="_blank"
              rel="noreferrer"
              className={contactCardClass}
            >
              <div className="flex min-w-0 w-full flex-col items-center gap-2">
                <span
                  aria-hidden="true"
                  className={contactIconClass}
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
                    <path d="M6.5 8.5H3.2V21h3.3V8.5ZM4.85 3A1.95 1.95 0 1 0 4.85 6.9 1.95 1.95 0 0 0 4.85 3ZM21 13.85c0-3.77-2.01-5.53-4.7-5.53-2.16 0-3.13 1.19-3.67 2.03V8.5H9.33V21h3.3v-6.18c0-1.63.31-3.2 2.33-3.2 1.99 0 2.03 1.86 2.03 3.3V21H21v-7.15Z" />
                  </svg>
                </span>
                <span className="min-w-0 text-center">
                  <span className="block font-semibold text-white">LinkedIn</span>
                  <span className={contactSubtitleClass}>
                    SUAS@STEM
                  </span>
                </span>
              </div>
            </a>

            <a
              href="https://instagram.com/suas.stem"
              target="_blank"
              rel="noreferrer"
              className={contactCardClass}
            >
              <div className="flex min-w-0 w-full flex-col items-center gap-2">
                <span
                  aria-hidden="true"
                  className={contactIconClass}
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current" strokeWidth="1.8" aria-hidden="true">
                    <rect x="3" y="3" width="18" height="18" rx="5" />
                    <circle cx="12" cy="12" r="4.25" />
                    <circle cx="17.25" cy="6.75" r="1" className="fill-current stroke-none" />
                  </svg>
                </span>
                <span className="min-w-0 text-center">
                  <span className="block font-semibold text-white">Instagram</span>
                  <span className={contactSubtitleClass}>
                    @suas.stem
                  </span>
                </span>
              </div>
            </a>

            <a
              href="https://www.youtube.com/@SUASSTEM"
              target="_blank"
              rel="noreferrer"
              className={contactCardClass}
            >
              <div className="flex min-w-0 w-full flex-col items-center gap-2">
                <span
                  aria-hidden="true"
                  className={contactIconClass}
                >
                  <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                    <rect x="3" y="5" width="18" height="14" rx="4" />
                    <path d="m10 8 6 4-6 4V8Z" fill="currentColor" stroke="none" />
                  </svg>
                </span>
                <span className="min-w-0 text-center">
                  <span className="block font-semibold text-white">YouTube</span>
                  <span className={contactSubtitleClass}>SUAS@STEM</span>
                </span>
              </div>
            </a>
        </div>

        <form onSubmit={handleSubmit} className="w-full space-y-4" aria-label="Sponsor form">
          <div>
            <label className="sr-only">Name / Company</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Name / Company"
              className={fieldClass}
            />
          </div>

          <div>
            <label className="sr-only">Email</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className={fieldClass}
            />
          </div>

          <div>
            <label className="sr-only">Message</label>
            <textarea
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Message"
              rows={6}
              className={`${fieldClass} resize-none`}
            />
          </div>

          <div className="flex items-center gap-4 pt-1">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 bg-teal-400 hover:bg-teal-500 text-black font-semibold px-6 py-3 rounded-full shadow-lg transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Sending…" : "Send"}
            </button>

            {success && <p className="text-green-400 m-0">{success}</p>}
            {error && <p className="text-red-400 m-0">{error}</p>}
          </div>
        </form>

        <section className="mt-10 border-t border-white/10 pt-8" aria-labelledby="sponsors-supporters-heading">
          <h2 id="sponsors-supporters-heading" className="mb-2 text-2xl font-bold">
            Sponsors &amp; Supporters
          </h2>
          <p className="m-0 text-gray-300">
            SUAS@STEM currently has no external sponsors. We are grateful for the support of
            Melissa Wrenchey, Andy Christensen, Bill Cattin, and James Boyd.
          </p>
        </section>
      </div>
    </main>
  );
}
