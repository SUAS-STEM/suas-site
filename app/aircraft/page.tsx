"use client";
import Image from "next/image";
import { useEffect, useState } from "react";

export default function AircraftPage() {
    const [images, setImages] = useState<string[]>([]);

    useEffect(() => {
        fetch("/api/images?folder=aircraft")
            .then((res) => res.json())
            .then((data: string[]) => setImages(data));
    }, []);

    const specs: [string, string][] = [
        ["Tip-to-Tip Diameter", "2.1 m (7 ft)"],
        ["Weight", "7.7 kg (17 lbs)"],
        ["Specific Thrust Efficiency", "10.47 g/W"],
        ["Cruise Speed", "25 kph (15 mph)"],
        ["Hover Flight Time", "59.2 min"],
        ["Conservative Range", "8.6 km (5.3 mi)"],
    ];
    return (
        <main className="bg-black text-white font-sans min-h-full flex-1 px-4 md:px-24 md:py-16 py-8 flex flex-col">
            <section className="px-0 md:px-6 max-sm:mt-12">
                <div style={{ maxWidth: 900, margin: "0 auto" }}>
                    <h1>Event Horizon-3</h1>

                    <p>
                        Event Horizon-3 (EH-3) is the third aircraft in a generation of large,
                        endurance-based, autonomous quadcopter developed by the SUAS@STEM team. It
                        features a 2-meter, tri-foldable airframe. When paired with a propulsion
                        system designed for high efficiency, EH-3 can achieve impressive flight
                        times while maintaining a compact form factor that fits snugly in a single
                        backpack.
                    </p>
                    <p>
                        As the latest iteration in the Event Horizon series, EH-3 incorporates
                        lessons learned from the previous aircrafts, representing a significant step
                        towards efficiency and mission capability.
                    </p>

                    <h3>Key Specifications</h3>

                    <table>
                        <thead>
                            <tr>
                                <th>Parameter</th>
                                <th>Value</th>
                            </tr>
                        </thead>
                        <tbody>
                            {specs.map((spec) => (
                                <tr key={spec[0]}>
                                    <td>{spec[0]}</td>
                                    <td>{spec[1]}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <h2>Key Design Principles</h2>
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
                    <p>To be added.</p>
                    <div className="flex flex-col gap-8 mt-4">
                        {images.map((src) => (
                            <div key={src} className="w-full relative">
                                <Image
                                    src={src}
                                    alt="Aircraft"
                                    width={0}
                                    height={0}
                                    sizes="100vw"
                                    style={{ width: "100%", height: "auto", objectFit: "cover", borderRadius: "4px" }}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            </section>
        </main>
    );
}
