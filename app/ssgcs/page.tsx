"use client";
import { useState } from "react";

export default function SsgcsPage() {
    const [selectedPlatform, setSelectedPlatform] = useState<"windows-x86" | null>("windows-x86");

    const downloadLinks: Record<string, string> = {
        "windows-x86": "https://github.com/SUAS-STEM/.gcs/releases/download/dev/ssgcs.exe",
    };

    const handleDownload = () => {
        if (selectedPlatform && downloadLinks[selectedPlatform]) {
            window.location.href = downloadLinks[selectedPlatform];
        }
    };

    return (
        <main className="text-white font-sans min-h-full flex-1 px-4 md:px-24 md:py-16 py-8 flex flex-col">
            <section className="px-0 md:px-6 max-w-2xl mx-auto">
                <h1>Download SUAS@STEM Ground Control Software</h1>

                <p>
                    The SUAS@STEM Ground Control Software (SSGCS) is used to control and monitor
                    the Event Horizon aircraft during flight operations.
                </p>

                <div className="mt-8">
                    <h2>Select Your Platform</h2>

                    <div className="space-y-3 mt-4">
                        <label className="flex items-center p-4 border border-white/30 rounded-lg cursor-pointer hover:bg-white/5 transition"
                            style={{
                                backgroundColor: selectedPlatform === "windows-x86" ? "rgba(255, 255, 255, 0.1)" : "transparent",
                            }}>
                            <input
                                type="radio"
                                name="platform"
                                value="windows-x86"
                                checked={selectedPlatform === "windows-x86"}
                                onChange={(e) => setSelectedPlatform(e.target.value as "windows-x86")}
                                className="w-4 h-4"
                            />
                            <span className="ml-3">
                                <span className="block font-semibold">Windows (x86)</span>
                                <span className="text-sm text-white/60">For 32-bit and 64-bit Windows systems</span>
                            </span>
                        </label>
                    </div>

                    <button
                        onClick={handleDownload}
                        disabled={!selectedPlatform}
                        className="mt-8 inline-block rounded-md bg-blue-600 px-6 py-3 text-white font-semibold transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Download SSGCS
                    </button>
                </div>

                <div className="mt-12 pt-8 border-t border-white/20">
                    <h2>Requirements</h2>
                    <ul className="list-disc list-inside space-y-2 text-white/80">
                        <li>Windows 11</li>
                        <li>Microsoft Visual C++ Redistributable</li>
                    </ul>
                </div>

                <div className="mt-8">
                    <h2>Support</h2>
                    <p className="text-white/80">
                        For issues or questions, please contact the SUAS@STEM team.
                    </p>
                </div>
            </section>
        </main>
    );
}
