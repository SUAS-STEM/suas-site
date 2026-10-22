import Image from "next/image";
import { ReactElement } from "react";
import { MEMBER_IMAGES } from "@/lib/memberPhotos.generated";
import { getMemberImageSrc } from "./types";

export function MemberPhoto({
    name,
    size = 200,
    className,
}: {
    name: string;
    size?: number;
    className?: string;
}): ReactElement {
    const original = getMemberImageSrc(name);
    const optimized = MEMBER_IMAGES[original.split("/").at(-1) ?? ""];

    if (optimized) {
        // Pre-generated assets avoid runtime image optimization and occasional
        // multi-megabyte PNG fallbacks from Next's /_next/image endpoint.
        return (
            // eslint-disable-next-line @next/next/no-img-element
            <img
                src={optimized.small}
                srcSet={`${optimized.small} 256w, ${optimized.large} 640w`}
                sizes={`${size}px`}
                alt={name}
                width={size}
                height={size}
                loading="lazy"
                decoding="async"
                style={{ objectFit: "cover" }}
                className={className}
            />
        );
    }

    return (
        <Image
            src={original}
            alt={name}
            width={size}
            height={size}
            style={{ objectFit: "cover" }}
            className={className}
        />
    );
}
