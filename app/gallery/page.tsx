"use client";
import Image from "next/image";
import { useEffect, useState } from "react";

export default function GalleryPage() {
  const [galleryPhotos, setGalleryPhotos] = useState<string[]>([]);

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

  return (
    <main className="bg-black text-white font-sans min-h-full flex-1 px-8 md:px-24 md:py-16 py-8 flex flex-col">
      <section className="mt-16 px-6 max-sm:mt-12">
        <div className="max-w-6xl mx-auto text-center">
          <h3 className="text-3xl md:text-5xl font-extrabold text-white mb-6">
            Gallery
          </h3>
          <p className="text-gray-300 max-w-3xl mx-auto mb-12">
            These photos showcase the team's hard work, focus, and collaboration as
            they design, build, and test their drones&mdash;highlighting not just
            their dedication but also the hands-on learning and growth that drive
            their success.
          </p>
          <div className="grid grid-cols-3 max-md:grid-cols-2 gap-2 sm:gap-3 md:gap-6">
            {galleryPhotos.map((src, idx) => (
              <div key={idx} className="bg-white border-2 border-white rounded overflow-hidden shadow-sm">
                <Image
                  src={src}
                  alt={`gallery-${idx + 1}`}
                  className="w-full h-auto aspect-[4/3] object-cover"
                  onError={(e) => {
                    (e.currentTarget as HTMLImageElement).src = "/logo.png";
                  }}
                  width={400}
                  height={300}
                />
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
