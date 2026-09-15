import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ODM Stitch Monitor | SUAS@STEM",
  robots: { index: false, follow: false, nocache: true },
};

export default function StitchLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return children;
}
