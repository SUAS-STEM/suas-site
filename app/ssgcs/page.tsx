"use client";
import { useEffect, useState } from "react";

interface ReleaseInfo {
    tag: string;
    date: string;
    url: string;
}

const PLATFORM_ASSET: Record<string, string> = {
    "windows-x86": "ssgcs-win32-amd64.exe",
    "macos-arm64": "ssgcs-macos-arm64.dmg",
};

export default function SsgcsPage() {
    const [selectedPlatform, setSelectedPlatform] = useState<"windows-x86" | "macos-arm64" | null>("windows-x86");
    const [release, setRelease] = useState<ReleaseInfo | null>(null);

    useEffect(() => {
        fetch("https://api.github.com/repos/SUAS-STEM/.gcs/releases/latest")
            .then((r) => r.json())
            .then((data) => {
                const tag: string = data.tag_name ?? "";
                const date = data.published_at
                    ? new Date(data.published_at).toLocaleString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                      })
                    : "";
                setRelease({ tag, date, url: data.html_url ?? "" });
            })
            .catch(() => {
                setRelease({
                    tag: "dev-v0.001",
                    date: "",
                    url: "https://github.com/SUAS-STEM/.gcs/releases",
                });
            });
    }, []);

    const handleDownload = () => {
        if (!selectedPlatform || !release) return;
        const asset = PLATFORM_ASSET[selectedPlatform];
        window.location.href = `https://github.com/SUAS-STEM/.gcs/releases/download/${release.tag}/${asset}`;
    };

    return (
        <main className="text-white font-sans min-h-full flex-1 px-4 md:px-24 md:py-16 py-8 flex flex-col">
            <section className="px-0 md:px-6 max-w-2xl mx-auto">
                <h1>Ground Control Software</h1>

                <p>
                    The SUAS@STEM Ground Control Software (SSGCS) is used to control and monitor the
                    Event Horizon aircraft during flight operations.{" "}
                    <b>It is available for use exclusively by the SUAS@STEM team.</b>
                </p>

                <div className="mt-8">
                    <h2>Select Your Platform</h2>

                    <div className="space-y-3 mt-4">
                        <label
                            className="flex items-center p-4 border border-white/30 rounded-lg cursor-pointer hover:bg-white/5 transition"
                            style={{
                                backgroundColor:
                                    selectedPlatform === "windows-x86"
                                        ? "rgba(255, 255, 255, 0.1)"
                                        : "transparent",
                            }}
                        >
                            <input
                                type="radio"
                                name="platform"
                                value="windows-x86"
                                checked={selectedPlatform === "windows-x86"}
                                onChange={(e) =>
                                    setSelectedPlatform(e.target.value as "windows-x86" | "macos-arm64")
                                }
                                className="w-4 h-4"
                            />
                            <span className="ml-3">
                                <span className="block font-semibold">Windows (x86)</span>
                                <span className="text-sm text-white/60">
                                    For 64-bit Intel and AMD processors
                                </span>
                            </span>
                        </label>

                        <label
                            className="flex items-center p-4 border border-white/30 rounded-lg cursor-pointer hover:bg-white/5 transition"
                            style={{
                                backgroundColor:
                                    selectedPlatform === "macos-arm64"
                                        ? "rgba(255, 255, 255, 0.1)"
                                        : "transparent",
                            }}
                        >
                            <input
                                type="radio"
                                name="platform"
                                value="macos-arm64"
                                checked={selectedPlatform === "macos-arm64"}
                                onChange={(e) =>
                                    setSelectedPlatform(e.target.value as "windows-x86" | "macos-arm64")
                                }
                                className="w-4 h-4"
                            />
                            <span className="ml-3">
                                <span className="block font-semibold">macOS (Apple Silicon)</span>
                                <span className="text-sm text-white/60">
                                    For Apple M-series processors
                                </span>
                            </span>
                        </label>
                    </div>

                    <div className="mt-8 flex items-center gap-4 flex-wrap">
                        <button
                            onClick={handleDownload}
                            disabled={!selectedPlatform || !release}
                            className="btn-download"
                            style={{ marginTop: 0 }}
                        >
                            Download SSGCS
                        </button>

                        {release && (
                            <div className="text-sm text-white/50 font-mono">
                                <a
                                    href={release.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-white/70 hover:text-white transition"
                                >
                                    {release.tag}
                                </a>
                                {release.date && (
                                    <span className="ml-2 text-white/40">{release.date}</span>
                                )}
                            </div>
                        )}
                    </div>
                </div>

                <div className="mt-12 pt-8 border-t border-white/20">
                    <h2>System Requirements</h2>
                    <table>
                        <thead>
                            <tr>
                                <th>Component</th>
                                <th>Minimum</th>
                                <th>Recommended</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>OS</td>
                                <td>Windows 11</td>
                                <td>Windows 11</td>
                            </tr>
                            <tr>
                                <td>CPU</td>
                                <td>Intel or AMD</td>
                                <td>
                                    Intel or AMD
                                    <br />
                                    11th generation+
                                    <br />
                                    8+ logical cores
                                    <br />
                                    2.00 GHz+
                                </td>
                            </tr>
                            <tr>
                                <td>RAM</td>
                                <td>4 GB</td>
                                <td>16 GB</td>
                            </tr>
                            <tr>
                                <td>Storage</td>
                                <td>500 MB free</td>
                                <td>16 GB free</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div className="mt-8">
                    <h2>Attribution</h2>
                    <p className="text-white/80">
                        SUAS@STEM Ground Control Software is built using the following libraries and
                        software:
                    </p>
                    <ul className="list-disc list-inside text-white/80 mt-2">
                        <li>Microsoft Visual C++ 2026</li>
                        <li>CMake</li>
                        <li>Qt 6</li>
                        <li>MAVSDK 3.17</li>
                        <li>OpenCV 5</li>
                        <li>Inno Setup</li>
                    </ul>
                </div>

                <div className="mt-8">
                    <h2>Support</h2>
                    <p className="text-white/80">
                        For issues or questions, please contact{" "}
                        <a
                            href="mailto:ethan@ethanchan.studio"
                            className="text-blue-400 hover:underline"
                        >
                            Ethan Chan
                        </a>
                        .
                    </p>
                </div>
            </section>
        </main>
    );
}
