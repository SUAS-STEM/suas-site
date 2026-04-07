"use client";
import Image from "next/image";

export default function Home() {
    return (
        <main className="bg-black text-white font-sans min-h-full flex-1 px-8 md:px-24 md:py-16 py-8 flex flex-col">
            {/* Hero Section */}
            <section className="flex items-center justify-center flex-1">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
                    {/* Left: text content */}
                    <div>
                        <h1 className="title">SUAS</h1>
                        <h2
                            className="font-semibold text-center"
                            style={{ fontSize: "clamp(1.5rem, 5vw, 2.25rem)" }}
                        >
                            Tesla STEM High School
                        </h2>
                        <p className="text-teal-300 font-medium mb-6">We're flying ahead.</p>

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
                            2026 is the first year of SUAS@STEM. We are currently designing and
                            testing our third aircraft, Event Horizon 3, and are excited to
                            represent Tesla STEM High School at Skyway Range in Tulsa, Oklahoma
                            later this year.
                        </p>
                        <p className="text-gray-300 max-w-xl mb-8">
                            SUAS@STEM is affiliated with Tesla STEM's{" "}
                            <a href="https://engineeringclub.org" target="_blank">
                                Engineering Club
                            </a>
                            .
                        </p>

                        <a
                            href="/team"
                            className="inline-flex items-center gap-3 bg-teal-400 hover:bg-teal-500 text-black font-semibold px-6 py-3 rounded-full shadow-lg"
                        >
                            Learn more <span aria-hidden>→</span>
                        </a>
                    </div>

                    {/* Right: image */}
                    <div className="flex justify-center md:justify-end">
                        <div
                            className="relative w-64 h-64 md:w-80 md:h-80 rounded-xl p-1"
                            style={{ boxShadow: "0 8px 40px rgba(20,184,166,0.55)" }}
                        >
                            {/* Decorative border / glow */}
                            <div className="absolute inset-0 rounded-xl overflow-hidden border-4 border-teal-300/30 bg-gray-800">
                                {/* Replace `/hero-team.jpg` with the provided image placed into `public/hero-team.jpg` */}
                                <Image
                                    src="/images/image-0.png"
                                    alt="SUAS team photo"
                                    fill
                                    className="object-cover"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </main>
    );
}
