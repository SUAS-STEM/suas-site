
import type { Metadata } from "next";
import { Geist, Geist_Mono, Exo_2 } from "next/font/google";
import "./globals.css";
import Navbar from "../components/Header";
import Footer from "../components/Footer";
import Loader from "../components/Loader";

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
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${exo.variable} antialiased flex flex-col bg-black text-white min-h-screen`}
      >
  <Loader />
        <Navbar />
        <div className="flex-1 flex flex-col grow bg-black">
          {children}
        </div>
        <Footer />
      </body>
    </html>
  );
}
