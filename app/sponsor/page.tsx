"use client";

import React, { useState } from "react";
import { db } from "../../lib/firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

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
      await addDoc(collection(db, "sponsors"), {
        name,
        email,
        message,
        createdAt: serverTimestamp(),
      });
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

  return (
    <main className="min-h-screen flex flex-col items-center justify-start py-12 px-4 sm:px-6 lg:px-8 text-white font-sans">
      <div className="w-full max-w-3xl">
        <h1 className="text-6xl font-extrabold mb-3 text-left">Sponsor Us</h1>
        <p className="text-gray-300 mb-8 max-w-2xl">
          Help send SUAS@STEM to the competition. Whether it&apos;s funding, parts, or
          mentorship, we&apos;d love to hear from you — drop us a note below and we&apos;ll get
          back to you.
        </p>

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
      </div>
    </main>
  );
}
