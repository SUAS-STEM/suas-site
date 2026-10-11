"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

// Keep this in sync with the pre-hydration check in app/layout.tsx.
const SPLASH_SESSION_KEY = "suas-splash-seen-v1";

export default function Loader(): React.ReactElement | null {
  const [visible, setVisible] = useState(true);
  const [startWipe, setStartWipe] = useState(false);
  const [w, setW] = useState(0);

  useEffect(() => {
    // A full-document navigation can remount RootLayout (e.g. when the Next.js
    // router falls back to a reload). The splash is for the first visit in this
    // tab, not for each remount or page transition.
    try {
      if (window.sessionStorage.getItem(SPLASH_SESSION_KEY) === "1") {
        setVisible(false);
        return;
      }
      window.sessionStorage.setItem(SPLASH_SESSION_KEY, "1");
    } catch {
      // Browsers can disable storage. Still show the splash normally.
    }

    setW(window.innerWidth || 0);

    // Play float animation for ~1.8s then start wipe
    const floatMs = 1800;
    const wipeMs = 900;
    const t1 = setTimeout(() => setStartWipe(true), floatMs);
    const t2 = setTimeout(() => setVisible(false), floatMs + wipeMs);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  const [dots, setDots] = useState(".");
  // animate dots
  useEffect(() => {
    const interval = setInterval(() => {
        setDots((prev) => (prev.length < 3 ? prev + "." : ""));
    }, 400);
    return () => clearInterval(interval);
    }, []);


  if (!visible) return null;

  // Drone floating variant
  const floatTransition: any = {
    y: {
      repeat: Infinity,
      repeatType: "loop",
      duration: 1.8,
      ease: "easeInOut",
    },
  };
  return (
    <AnimatePresence>
      <motion.div
        className="loader-overlay"
        initial={{ opacity: 1, x: 0 }}
        animate={startWipe ? { x: w + 40, opacity: 1 } : { x: 0, opacity: 1 }}
        transition={startWipe ? { duration: 0.85, ease: "easeInOut" } : {}}
        exit={{ opacity: 0 }}
      >
        {/* central stage for the drone */}
        <div className="loader-stage flex flex-col" aria-hidden>
          <motion.div
            className="drone"
            animate={startWipe ? { x: w + 200, y: -220, rotate: 70 } : { y: [0, -14, 0] }}
            transition={startWipe ? { duration: 0.85, ease: "easeIn" } : (floatTransition as any)}
          >
            {/* simple SVG drone */}
            <img src="/drone.svg" alt="drone" />
          </motion.div>
                    <motion.div
            className="drone text-black font-mono font-bold w-100 mt-4 text-center"
            animate={startWipe ? { opacity: 0 } : {}}
            transition={startWipe ? { duration: 0.2, ease: "easeIn" } : (floatTransition as any)}
          >
                <p className="inline-flex items-center justify-center">
                    <span className="font-mono font-bold">SUAS@STEM{dots}</span>
                </p>
          </motion.div>

        </div>
      </motion.div>
    </AnimatePresence>
  );
}
