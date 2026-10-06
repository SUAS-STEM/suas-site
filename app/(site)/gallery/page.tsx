"use client";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import galleryStyles from "./gallery.module.css";
import titleStyles from "../page-title.module.css";
import {
    DURABLE_GALLERY_BASE,
    GALLERY_CAPTIONS,
    GALLERY_DISPLAY,
    GALLERY_PHOTOS,
    GALLERY_THUMBNAILS,
} from "@/lib/galleryPhotos.generated";

function applyDurableFallback(
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
    const galleryDisplay = GALLERY_DISPLAY as readonly string[];
    const galleryThumbnails = GALLERY_THUMBNAILS as readonly string[];
    const galleryCaptions = GALLERY_CAPTIONS as readonly { caption: string; people: readonly string[] }[];
    const [isFullscreenMode, setIsFullscreenMode] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [switchClass, setSwitchClass] = useState("");
    const [currentImageLoaded, setCurrentImageLoaded] = useState(false);
    const prefetchedFullscreenImages = useRef<HTMLImageElement[]>([]);

    useEffect(() => {
        if (!isFullscreenMode) return;

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "ArrowRight") {
                setSwitchClass("gallery-switch-next-in");
                setCurrentImageLoaded(false);
                setCurrentIndex((prev) => (prev + 1) % galleryPhotos.length);
            } else if (event.key === "ArrowLeft") {
                setSwitchClass("gallery-switch-prev-in");
                setCurrentImageLoaded(false);
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
        setCurrentImageLoaded(false);
        setIsFullscreenMode(true);
    };

    const showNext = () => {
        if (galleryPhotos.length <= 1) return;
        setSwitchClass("gallery-switch-next-in");
        setCurrentImageLoaded(false);
        setCurrentIndex((prev) => (prev + 1) % galleryPhotos.length);
    };

    const showPrevious = () => {
        if (galleryPhotos.length <= 1) return;
        setSwitchClass("gallery-switch-prev-in");
        setCurrentImageLoaded(false);
        setCurrentIndex((prev) => (prev - 1 + galleryPhotos.length) % galleryPhotos.length);
    };

    // Do not compete with the currently opened full-resolution image. Once it
    // has loaded, quietly fetch only the immediate neighbors for fast arrow-key
    // navigation. The grid itself always stays thumbnail-only.
    useEffect(() => {
        prefetchedFullscreenImages.current = [];
        if (!isFullscreenMode || !currentImageLoaded || galleryPhotos.length < 2) return;
        const timer = window.setTimeout(() => {
            const indices = [
                (currentIndex + 1) % galleryPhotos.length,
                (currentIndex - 1 + galleryPhotos.length) % galleryPhotos.length,
            ];
            prefetchedFullscreenImages.current = Array.from(new Set(indices)).map((index) => {
                const image = new window.Image();
                image.decoding = "async";
                image.fetchPriority = "low";
                image.src = galleryDisplay[index] || galleryPhotos[index];
                return image;
            });
        }, 250);
        return () => window.clearTimeout(timer);
    }, [currentImageLoaded, currentIndex, galleryDisplay, galleryPhotos, isFullscreenMode]);

    return (
        <main className="text-white font-sans py-8">
            <section className="px-0 md:px-6 max-sm:mt-12">
                <div className="max-w-6xl mx-auto text-center">
                    <h1 className={titleStyles.pageTitle}>Gallery</h1>
                    <div className="mb-6 flex justify-center">
                        <button
                            type="button"
                            onClick={() => {
                                setCurrentImageLoaded(false);
                                setIsFullscreenMode((prev) => !prev);
                            }}
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
                                        src={
                                            galleryDisplay[currentIndex] ||
                                            galleryPhotos[currentIndex] ||
                                            "/logo.png"
                                        }
                                        alt={
                                            galleryCaptions[currentIndex]?.caption ||
                                            (galleryCaptions[currentIndex]?.people.length
                                                ? `Photo including ${galleryCaptions[currentIndex].people.join(", ")}`
                                                : `Gallery photo ${currentIndex + 1}`)
                                        }
                                        className="block h-auto w-auto max-w-full rounded-xl border border-white"
                                        style={{ borderRadius: "0.75rem" }}
                                        onError={(e) => {
                                            applyDurableFallback(e, galleryPhotos[currentIndex] || "/logo.png");
                                        }}
                                        onLoad={() => setCurrentImageLoaded(true)}
                                        width="1200"
                                        height="900"
                                        loading="eager"
                                        fetchPriority="high"
                                        decoding="async"
                                    />
                                </div>
                            </div>
                            {(galleryCaptions[currentIndex]?.caption || galleryCaptions[currentIndex]?.people.length > 0) && (
                                <div className={galleryStyles.fullscreenCaption}>
                                    {galleryCaptions[currentIndex]?.caption && (
                                        <p>{galleryCaptions[currentIndex].caption}</p>
                                    )}
                                    {galleryCaptions[currentIndex]?.people.length > 0 && (
                                        <p className={galleryStyles.people}>
                                            In this photo: {galleryCaptions[currentIndex].people.join(", ")}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="grid grid-cols-3 max-md:grid-cols-2 gap-2 sm:gap-3 md:gap-6">
                            {galleryPhotos.map((src, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    onClick={() => openFullscreenAt(idx)}
                                    className={galleryStyles.photoCard}
                                    style={{ contentVisibility: "auto", containIntrinsicSize: "400px 300px" }}
                                >
                                    <img
                                        src={galleryThumbnails[idx] || src}
                                        alt={
                                            galleryCaptions[idx]?.caption ||
                                            (galleryCaptions[idx]?.people.length
                                                ? `Photo including ${galleryCaptions[idx].people.join(", ")}`
                                                : `Gallery photo ${idx + 1}`)
                                        }
                                        className="w-full h-auto aspect-[4/3] object-cover rounded-lg"
                                        onError={(e) => {
                                            applyDurableFallback(e, src);
                                        }}
                                        width="400"
                                        height="300"
                                        loading={idx < 6 ? "eager" : "lazy"}
                                        fetchPriority={idx < 6 ? "high" : "low"}
                                        decoding="async"
                                    />
                                    {(galleryCaptions[idx]?.caption || galleryCaptions[idx]?.people.length > 0) && (
                                        <span className={galleryStyles.photoDetails}>
                                            {galleryCaptions[idx]?.caption && (
                                                <span className={galleryStyles.photoCaption}>
                                                    {galleryCaptions[idx].caption}
                                                </span>
                                            )}
                                            {galleryCaptions[idx]?.people.length > 0 && (
                                                <span className={galleryStyles.people}>
                                                    {galleryCaptions[idx].people.join(", ")}
                                                </span>
                                            )}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </section>
        </main>
    );
}
