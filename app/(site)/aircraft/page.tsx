"use client";
import Image from "next/image";
import { useEffect, useState } from "react";

function gradientAccent(index: number, count: number) {
    const t = count > 1 ? index / (count - 1) : 0;
    const saturation = 5 + t * 55; // white -> cyan (#4fd1d5)
    const lightness = 97 - t * 34;
    return `hsl(181, ${saturation}%, ${lightness}%)`;
}

export default function AircraftPage() {
    const [images, setImages] = useState<string[]>([]);

    useEffect(() => {
        fetch("/api/images?folder=aircraft")
            .then((res) => res.json())
            .then((data: string[]) => setImages(data));
    }, []);

    const highlightedSpecs: [string, string][] = [
        ["Tip-to-Tip Diameter", "173.5 cm (68.3 in)"],
        ["Specific Thrust Efficiency", "7.62 g/W"],
        ["Hover Flight Time", "45 min"],
    ];

    const flightSpecs: [string, string, string][] = [
        ["scale", "Weight", "11 kg (24.3 lbs)"],
        ["aspect_ratio", "Dimensions (L × W × H)", "173.5 × 173.5 × 42.7 cm\n(68.3 × 68.3 × 16.8 in)"],
        ["flight_takeoff", "Takeoff/Landing", "VTOL"],
        ["speed", "Cruise Speed", "25 kph (15 mph)"],
        ["timer", "Hover Flight Time", "45 min"],
        ["route", "Conservative Range", "22.5 km (14 mi)"],
    ];

    const softwareSpecs: [string, string, string][] = [
        ["battery_full", "Battery", "16S LiPo"],
        ["terminal", "Flight Stack", "ArduPilot"],
        ["videocam", "Video/Data Link", "Digital transmission"],
        ["memory", "Flight Controller", "STMicroelectronics STM32H757"],
        ["settings_input_antenna", "RC Link", "2.4 GHz manual\n900 MHz autopilot\n5 GHz data (video)"],
        ["gps_fixed", "Positioning", "RTK-enabled GPS"],
    ];
    return (
        <main className="text-white font-sans min-h-full flex-1 px-4 md:px-24 md:py-16 py-8 flex flex-col">
            <section className="px-0 md:px-6 max-sm:mt-12">
                <div style={{ maxWidth: 900, margin: "0 auto" }}>
                    <h1>Event Horizon-4</h1>

                    <p>
                        Event Horizon-4 (EH-4) is the fourth aircraft in a generation of large,
                        endurance-based, autonomous quadcopter developed by the SUAS@STEM team. It
                        features a 2-meter, tri-foldable airframe. When paired with a propulsion
                        system designed for high efficiency, EH-4 can achieve impressive flight
                        times while maintaining a compact form factor that fits snugly in a single
                        backpack.
                    </p>
                    <p>
                        As the latest iteration in the Event Horizon series, EH-4 incorporates
                        lessons learned from the previous aircrafts, representing a significant step
                        towards efficiency and mission capability.
                    </p>

                    <h2>Highlights</h2>

                    <div style={{ display: "flex", flexWrap: "wrap", gap: "20px", width: "100%" }}>
                        {highlightedSpecs.map((spec) => (
                            <div key={spec[0]} className="spec-card">
                                <p className="spec-value">{spec[1]}</p>
                                <p className="spec-label">{spec[0]}</p>
                            </div>
                        ))}
                    </div>

                    <h2>Specs</h2>

                    <h3>Flight</h3>
                    <div className="spec-grid">
                        {flightSpecs.map((spec, i) => (
                            <div key={spec[1]} className="spec-card-icon" style={{ ["--accent" as string]: gradientAccent(i, flightSpecs.length + softwareSpecs.length) }}>
                                <span className="icon-badge">
                                    <span className="material-symbols-outlined">{spec[0]}</span>
                                </span>
                                <div>
                                    <p className="spec-label">{spec[1]}</p>
                                    <p className="spec-value">{spec[2]}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <h3>Electrical</h3>
                    <div className="spec-grid">
                        {softwareSpecs.map((spec, i) => (
                            <div key={spec[1]} className="spec-card-icon" style={{ ["--accent" as string]: gradientAccent(flightSpecs.length + i, flightSpecs.length + softwareSpecs.length) }}>
                                <span className="icon-badge">
                                    <span className="material-symbols-outlined">{spec[0]}</span>
                                </span>
                                <div>
                                    <p className="spec-label">{spec[1]}</p>
                                    <p className="spec-value">{spec[2]}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    <h2 style={{ marginTop: "3rem" }}>Key Design Principles</h2>
                    <p>
                        <b>Efficiency</b>: Large-diameter propellers and a lightweight, custom
                        carbon fiber airframe allow for a high specific thrust efficiency and
                        long-endurance flights.
                    </p>
                    <p>
                        <b>Deployability</b>: Extremely foldable arms allows the aircraft to
                        collapse for transport while deploying quickly and tool-lessly into its
                        flight configuration, despite of its large size.
                    </p>
                    <p>
                        <b>Modularity</b>: The base platform supports additional sensors and
                        different payload configurations as the aircraft evolves through many
                        generations of students.
                    </p>
                    <h2>Images</h2>
                    <p style={{ textAlign: "center" }}>
                        <i>
                            Images are shown for illustrative purposes only and may not reflect the
                            current state of the aircraft.
                        </i>
                    </p>
                    <div className="flex flex-col gap-8 mt-4">
                        {images.map((src) => (
                            <div key={src} className="w-full relative">
                                <Image
                                    src={src}
                                    alt="Aircraft"
                                    width={0}
                                    height={0}
                                    sizes="100vw"
                                    style={{
                                        width: "100%",
                                        height: "auto",
                                        objectFit: "cover",
                                        borderRadius: "4px",
                                    }}
                                />
                            </div>
                        ))}
                    </div>
                    
                    <div className="mt-10">
                        <p className="mb-3 text-sm text-white/70">For SUAS members only:</p>
                        <a
                            href="/ssgcs"
                            className="inline-block rounded-md border border-white/50 bg-white/5 px-3 py-2 text-sm text-white/80 transition hover:bg-white hover:text-black"
                        >
                            Download SUAS@STEM Ground Control Software
                        </a>
                    </div>
                </div>
            </section>
        </main>
    );
}
