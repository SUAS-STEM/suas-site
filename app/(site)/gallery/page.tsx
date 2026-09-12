"use client";
import Image from "next/image";
import { useEffect, useState } from "react";
import { DURABLE_GALLERY_BASE, GALLERY_PHOTOS } from "@/lib/galleryPhotos.generated";

function useDurableFallback(
    event: React.SyntheticEvent<HTMLImageElement>,
    originalSrc: string,
) {
    const image = event.currentTarget;
    if (image.dataset.durableFallback === "1") {
        image.onerror = null;
        image.src = "/logo.png";
        return;
    }

    image.dataset.durableFallback = "1";
    const fileName = originalSrc.split("/").pop();
    if (!fileName) {
        image.src = "/logo.png";
        return;
    }
    image.src = `${DURABLE_GALLERY_BASE}/${fileName}`;
}

export default function GalleryPage() {
    // Baked into the static page and served from a Pi-independent origin.
    const galleryPhotos = GALLERY_PHOTOS as readonly string[];
    const [isFullscreenMode, setIsFullscreenMode] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [switchClass, setSwitchClass] = useState("");

    useEffect(() => {
        if (!isFullscreenMode) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "ArrowRight") {
                setSwitchClass("gallery-switch-next-in");
                setCurrentIndex((prev) => (prev + 1) % galleryPhotos.length);
            } else if (event.key === "ArrowLeft") {
                setSwitchClass("gallery-switch-prev-in");
                setCurrentIndex((prev) => (prev - 1 + galleryPhotos.length) % galleryPhotos.length);
            } else if (event.key === "Escape") {
                setIsFullscreenMode(false);
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isFullscreenMode, galleryPhotos.length]);

    const openFullscreenAt = (index: number) => {
        setSwitchClass("");
        setCurrentIndex(index);
        setIsFullscreenMode(true);
    };

    const showNext = () => {
        if (galleryPhotos.length <= 1) return;
        setSwitchClass("gallery-switch-next-in");
        setCurrentIndex((prev) => (prev + 1) % galleryPhotos.length);
    };

    const showPrevious = () => {
        if (galleryPhotos.length <= 1) return;
        setSwitchClass("gallery-switch-prev-in");
        setCurrentIndex((prev) => (prev - 1 + galleryPhotos.length) % galleryPhotos.length);
    };

    // Preload 6 next and 6 previous images. Should be a balance of performance and memory usage.
    const cacheSize = 6;
    const preloadIndices =
        galleryPhotos.length > 1
            ? Array.from(
                  new Set([
                      ...Array.from(
                          { length: Math.min(cacheSize, galleryPhotos.length - 1) },
                          (_, offset) => (currentIndex + offset + 1) % galleryPhotos.length,
                      ),
                      ...Array.from(
                          { length: Math.min(cacheSize, galleryPhotos.length - 1) },
                          (_, offset) =>
                              (currentIndex - (offset + 1) + galleryPhotos.length) %
                              galleryPhotos.length,
                      ),
                  ]),
              )
            : [];

    return (
        <main className="text-white font-sans py-8">
            <section className="px-0 md:px-6 max-sm:mt-12">
                <div className="max-w-6xl mx-auto text-center">
                    <h1>Gallery</h1>
                    <div className="mb-6 flex justify-center">
                        <button
                            type="button"
                            onClick={() => setIsFullscreenMode((prev) => !prev)}
                            className="button-main"
                        >
                            <img
                                src={
                                    isFullscreenMode
                                        ? "/images/icons/grid.svg"
                                        : "/images/icons/fullscreen.svg"
                                }
                                width="24"
                                height="24"
                                alt=""
                            />
                            {isFullscreenMode ? "Switch to Grid View" : "Switch to Fullscreen View"}
                        </button>
                    </div>
                    {isFullscreenMode ? (
                        <div className="w-full flex flex-col items-center gap-6">
                            <div className="flex items-center justify-center gap-4">
                                <button
                                    type="button"
                                    onClick={showPrevious}
                                    className="member-nav member-nav-left"
                                    aria-label="Previous photo"
                                >
                                    <Image
                                        src="/images/icons/back.svg"
                                        alt=""
                                        width={30}
                                        height={30}
                                        aria-hidden="true"
                                    />
                                </button>
                                <p className="text-sm text-gray-300 min-w-24 text-center">
                                    {galleryPhotos.length > 0
                                        ? `${currentIndex + 1} / ${galleryPhotos.length}`
                                        : "0 / 0"}
                                </p>
                                <button
                                    type="button"
                                    onClick={showNext}
                                    className="member-nav member-nav-right"
                                    aria-label="Next photo"
                                >
                                    <Image
                                        src="/images/icons/forward.svg"
                                        alt=""
                                        width={30}
                                        height={30}
                                        aria-hidden="true"
                                    />
                                </button>
                            </div>
                            <div className="w-full justify-center items-start flex">
                                <div
                                    key={`${currentIndex}-${switchClass}`}
                                    className={`w-full flex items-start justify-center rounded-xl overflow-hidden ${switchClass}`}
                                >
                                    <img
                                        src={galleryPhotos[currentIndex] || "/logo.png"}
                                        alt={`gallery-${currentIndex + 1}`}
                                        className="block h-auto w-auto max-w-full rounded-xl border border-white"
                                        style={{ borderRadius: "0.75rem" }}
                                        onError={(e) => {
                                            useDurableFallback(e, galleryPhotos[currentIndex] || "/logo.png");
                                        }}
                                        width="1200"
                                        height="900"
                                        loading="eager"
                                        decoding="async"
                                    />
                                </div>
                                {/* Used as a cache to have the browser preload images before they're clicked. */}
                                {preloadIndices.length > 0 && (
                                    <div className="hidden" aria-hidden="true">
                                        {preloadIndices.map((index) => (
                                            <img
                                                key={`preload-${index}`}
                                                src={galleryPhotos[index]}
                                                alt=""
                                                width="1200"
                                                height="900"
                                                loading="eager"
                                                fetchPriority="low"
                                                decoding="async"
                                                onError={(e) => useDurableFallback(e, galleryPhotos[index])}
                                            />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 max-md:grid-cols-2 gap-2 sm:gap-3 md:gap-6">
                            {galleryPhotos.map((src, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => openFullscreenAt(idx)}
                                    className="bg-white border-1 cursor-pointer border-white rounded overflow-hidden shadow-sm text-left"
                                >
                                    <img
                                        src={src}
                                        alt={`gallery-${idx + 1}`}
                                        className="w-full h-auto aspect-[4/3] object-cover rounded-lg"
                                        onError={(e) => {
                                            useDurableFallback(e, src);
                                        }}
                                        width="400"
                                        height="300"
                                        loading="lazy"
                                        decoding="async"
                                    />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </section>
        </main>
    );
}
