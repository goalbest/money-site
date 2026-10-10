"use client";

import { useEffect } from "react";

export default function PWACapture() {
  useEffect(() => {
    function handler(e: Event) {
      e.preventDefault();
      (window as any).__pwaInstallPrompt = e;
    }
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  return null;
}