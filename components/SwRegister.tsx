"use client";
import { useEffect } from "react";

/** Instala o service worker (só em produção, para não atrapalhar o desenvolvimento). */
export default function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
