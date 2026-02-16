"use client";
import Image from "next/image";
import { useEffect, useState } from "react";

export default function GalleryPage() {
    const [galleryPhotos, setGalleryPhotos] = useState<string[]>([]);
    const [isFullscreenMode, setIsFullscreenMode] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [switchClass, setSwitchClass] = useState("");

    useEffect(() => {
        let mounted = true;
        fetch("/api/gallery-images")
            .then((res) => res.json())
            .then((data: string[]) => {
                if (!mounted) return;
                if (Array.isArray(data) && data.length > 0) {
                    setGalleryPhotos(data);
                } else {
                    // fallback to a small default set if directory is empty
                    setGalleryPhotos([
                        "/images/image-21.png",
                        "/images/image-22.png",
                        "/images/image-23.png",
                    ]);
                }
            })
            .catch(() => {
                if (!mounted) return;
                setGalleryPhotos([
                    "/images/image-21.png",
                    "/images/image-22.png",
                    "/images/image-23.png",
                ]);
            });

        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        if (!isFullscreenMode) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "ArrowRight") {
                setSwitchClass("gallery-switch-next-in");
                setCurrentIndex((prev) => (prev + 1) % galleryPhotos.length);
            } else if (event.key === "ArrowLeft") {
                setSwitchClass("gallery-switch-prev-in");
                setCurrentIndex(
                    (prev) => (prev - 1 + galleryPhotos.length) % galleryPhotos.length,
                );
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
        setCurrentIndex(
            (prev) => (prev - 1 + galleryPhotos.length) % galleryPhotos.length,
        );
    };

    const previousIndex =
        galleryPhotos.length > 0
            ? (currentIndex - 1 + galleryPhotos.length) % galleryPhotos.length
            : 0;
    const nextIndex =
        galleryPhotos.length > 0
            ? (currentIndex + 1) % galleryPhotos.length
            : 0;

    return (
        <main className="bg-black text-white font-sans min-h-full flex-1 px-4 md:px-24 md:py-16 py-8 flex flex-col">
            <section className="mt-16 px-0 md:px-6 max-sm:mt-12">
                <div className="max-w-6xl mx-auto text-center">
                    <h3 className="text-3xl md:text-5xl font-extrabold text-white mb-6">
                        Gallery
                    </h3>
                    <p className="text-gray-300 max-w-3xl mx-auto mb-12">
                        These photos showcase the team&apos;s hard work, focus, and
                        collaboration as they design, build, and test their
                        drones&mdash;highlighting not just their dedication but also the
                        hands-on learning and growth that drive their success.
                    </p>
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
                            {isFullscreenMode
                                ? "Switch to Grid View"
                                : "Switch to Fullscreen View"}
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
                                    <Image
                                        src={galleryPhotos[currentIndex] || "/logo.png"}
                                        alt={`gallery-${currentIndex + 1}`}
                                        className="block h-auto w-auto max-w-full rounded-xl border border-white"
                                        style={{ borderRadius: "0.75rem" }}
                                        onError={(e) => {
                                            (e.currentTarget as HTMLImageElement).src = "/logo.png";
                                        }}
                                        width={1200}
                                        height={900}
                                        loading="eager"
                                        sizes="(max-width: 768px) 100vw, 1200px"
                                    />
                                </div>
                                {/* Used as a cache to have the browser preload images before they're clicked. */}
                                {galleryPhotos.length > 1 && (
                                    <div
                                        className="hidden"
                                        aria-hidden="true"
                                    >
                                        <Image
                                            src={galleryPhotos[nextIndex]}
                                            alt=""
                                            width={1200}
                                            height={900}
                                            loading="eager"
                                            fetchPriority="low"
                                            sizes="(max-width: 768px) 100vw, 1200px"
                                        />
                                        <Image
                                            src={galleryPhotos[previousIndex]}
                                            alt=""
                                            width={1200}
                                            height={900}
                                            loading="eager"
                                            fetchPriority="low"
                                            sizes="(max-width: 768px) 100vw, 1200px"
                                        />
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
                                    <Image
                                        src={src}
                                        alt={`gallery-${idx + 1}`}
                                        className="w-full h-auto aspect-[4/3] object-cover rounded-lg"
                                        onError={(e) => {
                                            (e.currentTarget as HTMLImageElement).src = "/logo.png";
                                        }}
                                        width={400}
                                        height={300}
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
