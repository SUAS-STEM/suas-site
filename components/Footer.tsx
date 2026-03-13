import Link from "next/link";
import React from "react";

export default function Footer(): React.ReactElement {
  return (
    <footer className="w-full border-t border-gray-800 py-6 font-sans">
      <div className="max-w-6xl mx-auto px-4">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex gap-6 items-center">
            <Link href="/" className="text-sm hover:underline">
              Home
            </Link>
            <Link href="/team" className="text-sm hover:underline">
              Team
            </Link>
            <Link href="/gallery" className="text-sm hover:underline">
              Gallery
            </Link>
            <Link href="/aircraft" className="text-sm hover:underline">
              Aircraft
            </Link>
            <Link href="/sponsor" className="text-sm hover:underline">
              Sponsor
            </Link>
          </div>

          <div className="text-sm text-center">
            © {new Date().getFullYear()} SUAS@STEM • All rights reserved.
          </div>

          {/* <div className="flex gap-4 items-center">
            <a href="#" aria-label="Twitter" className="text-sm hover:underline">
              Twitter
            </a>
            <a href="#" aria-label="Instagram" className="text-sm hover:underline">
              Instagram
            </a>
          </div> */}
        </div>
      </div>
    </footer>
  );
}
