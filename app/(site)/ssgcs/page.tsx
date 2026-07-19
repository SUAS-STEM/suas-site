"use client";
import { useEffect, useState } from "react";

interface ReleaseAsset {
    name: string;
    size: number;
}

interface ReleaseInfo {
    tag: string;
    date: string;
    url: string;
    assets: ReleaseAsset[];
}

const PLATFORM_ASSET: Record<string, string> = {
    "macos-arm64": "ssgcs-macos-arm64.dmg",
};

function formatBytes(bytes: number): string {
    if (!bytes) return "";
    const mb = bytes / (1024 * 1024);
    if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
    return `${mb.toFixed(1)} MB`;
}

export default function SsgcsPage() {
    const [selectedPlatform, setSelectedPlatform] = useState<"windows-x86" | "macos-arm64">("windows-x86");
    const [cudaVariant, setCudaVariant] = useState<"cuda" | "nocuda">("nocuda");
    const [release, setRelease] = useState<ReleaseInfo | null>(null);

    useEffect(() => {
        fetch("/api/ssgcs/release")
            .then((r) => r.json())
            .then((data: { tag: string; date: string; url: string; assets: ReleaseAsset[] }) => {
                const date = data.date
                    ? new Date(data.date).toLocaleString("en-US", {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                      })
                    : "";
                setRelease({ tag: data.tag, date, url: data.url, assets: data.assets ?? [] });
            })
            .catch(() => {});
    }, []);

    const assetName =
        selectedPlatform === "windows-x86"
            ? cudaVariant === "cuda"
                ? "ssgcs-win32-amd64-cuda.exe"
                : "ssgcs-win32-amd64.exe"
            : PLATFORM_ASSET[selectedPlatform];

    const selectedAsset = release?.assets.find((a) => a.name === assetName) ?? null;

    const handleDownload = () => {
        if (!selectedPlatform || !release) return;
        window.location.href = `/api/ssgcs/download?asset=${encodeURIComponent(assetName)}`;
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

                    {selectedPlatform === "windows-x86" && (
                        <div className="mt-6 flex items-center gap-3 flex-wrap">
                            <span className="text-sm text-white/60">GPU acceleration:</span>
                            <div className="inline-flex rounded-lg border border-white/30 p-1">
                                <button
                                    type="button"
                                    onClick={() => setCudaVariant("cuda")}
                                    className="px-3 py-1.5 rounded-md text-sm transition"
                                    style={{
                                        backgroundColor:
                                            cudaVariant === "cuda" ? "rgba(255, 255, 255, 0.15)" : "transparent",
                                        fontWeight: cudaVariant === "cuda" ? 600 : 400,
                                    }}
                                >
                                    CUDA
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCudaVariant("nocuda")}
                                    className="px-3 py-1.5 rounded-md text-sm transition"
                                    style={{
                                        backgroundColor:
                                            cudaVariant === "nocuda" ? "rgba(255, 255, 255, 0.15)" : "transparent",
                                        fontWeight: cudaVariant === "nocuda" ? 600 : 400,
                                    }}
                                >
                                    Standard
                                </button>
                            </div>
                            <span className="text-sm text-white/40">
                                {cudaVariant === "cuda" ? (
                                    <>
                                        Higher performance,{" "}
                                        <b className="text-blue-400">requires a NVIDIA GPU</b>
                                    </>
                                ) : (
                                    "CPU-only, no NVIDIA GPU required"
                                )}
                            </span>
                        </div>
                    )}

                    <div className="mt-8 flex items-center gap-4 flex-wrap">
                        <button
                            onClick={handleDownload}
                            disabled={!selectedPlatform || !release}
                            className="btn-download"
                            style={{ marginTop: 0 }}
                        >
                            Download SSGCS
                            {selectedAsset && (
                                <span className="ml-2 text-white/60 font-normal">
                                    ({formatBytes(selectedAsset.size)})
                                </span>
                            )}
                        </button>

                        {release && (
                            <div className="text-sm text-white/50 font-mono">
                                <span className="text-white/70">{release.tag}</span>
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
                                <td>250 MB free<br /><b>With AI</b>: 3 GB free</td>
                                <td>16+ GB</td>
                            </tr>
                            <tr>
                                <td>Storage</td>
                                <td>400 MB free<br /><b>With AI</b>: 16 GB free</td>
                                <td>1 GB free<br /><b>With AI</b>: 32 GB free</td>
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
