import type { Metadata } from "next";
import { Geist, Geist_Mono, Exo_2 } from "next/font/google";
import "./globals.css";
import Loader from "../components/Loader";
import SiteAnalytics from "../components/SiteAnalytics";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const exo = Exo_2({
  variable: "--font-exo2",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SUAS@STEM",
  description: "Official website for SUAS at Tesla STEM High School",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/dronefav.svg" sizes="any" />
        {/* Hide the server-rendered splash before paint on subsequent document
            loads. The client Loader removes it once hydration completes. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{if(sessionStorage.getItem("suas-splash-seen-v1")==="1")document.documentElement.setAttribute("data-suas-splash-seen","1")}catch{}`,
          }}
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,500,0,0"
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${exo.variable} antialiased flex flex-col bg-black text-white min-h-screen`}
        suppressHydrationWarning
      >
  <Loader />
        <SiteAnalytics />
        {children}
      </body>
    </html>
  );
}
