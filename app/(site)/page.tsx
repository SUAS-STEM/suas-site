"use client";
import Image from "next/image";
import { INTEREST_FORM_URL } from "./team/data";
import styles from "./home.module.css";

export default function Home() {
    return (
        <main className={`text-white font-sans min-h-full flex-1 md:py-16 py-8 flex flex-col ${styles.pageMain}`}>
            {/* Hero Section */}
            <section className="flex items-center justify-center flex-1">
                <div className={styles.heroGrid}>
                    {/* Left: text content */}
                    <div className="text-left">
                        <h1 className="title" style={{ textAlign: "left", marginBottom: 0 }}>
                            SUAS
                        </h1>
                        <p
                            className="font-semibold mt-1"
                            style={{ fontSize: "clamp(1.25rem, 4vw, 1.75rem)" }}
                        >
                            Tesla STEM High School
                        </p>
                        <p
                            className="text-teal-300 font-semibold tracking-wide mb-8 mt-2"
                            style={{ fontSize: "clamp(1.1rem, 3vw, 1.5rem)" }}
                        >
                            We&apos;re flying ahead.
                        </p>

                        <p className="text-gray-300 max-w-xl mb-8">
                            SUAS@STEM is Tesla STEM High School's competition team for the
                            RoboNation{" "}
                            <a href="https://suas-competition.org/" target="blank">
                                Student Unmanned Aerial Systems
                            </a>{" "}
                            (SUAS) competition. Our team designs and builds autonomous drones
                            capable of performing complex real-world missions including navigation,
                            computer vision, and payload delivery.
                        </p>
                        <p className="text-gray-300 max-w-xl mb-8">
                            2026-2027 is the second year for SUAS@STEM. We are currently engineering
                            and building our fifth aircraft, Event Horizon-5, and are excited to
                            represent Tesla STEM High School at Skyway Range in Tulsa, Oklahoma in
                            2027.
                        </p>

                        <a
                            href={INTEREST_FORM_URL}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="join-modal-apply"
                        >
                            Build Event Horizon-5 With Us <span aria-hidden>→</span>
                        </a>
                    </div>

                    {/* Right: image */}
                        <div className={styles.heroPhoto}>
                        <div
                            className={`hero-frame ${styles.photoFrame}`}
                            style={{ boxShadow: "0 8px 40px rgba(20,184,166,0.35)" }}
                        >
                            {/* Decorative border / glow */}
                            <div className="absolute inset-0 rounded-xl overflow-hidden border border-teal-300/20 bg-gray-800">
                                <Image
                                    src="/images/team-photo-v2.png"
                                    alt="SUAS team photo"
                                    fill
                                    sizes="(max-width: 768px) calc(100vw - 4rem), 64rem"
                                    quality={100}
                                    preload
                                    className="object-cover"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="w-full max-w-5xl mx-auto mt-16" aria-label="SUAS@STEM video">
                <div className="aspect-video overflow-hidden rounded-xl border border-teal-300/20 bg-gray-900 shadow-[0_8px_40px_rgba(20,184,166,0.18)]">
                    <iframe
                        className="h-full w-full"
                        src="https://www.youtube.com/embed/zpQUnOtP84c?mute=1"
                        title="SUAS@STEM video"
                        loading="lazy"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                    />
                </div>
            </section>
        </main>
    );
}
