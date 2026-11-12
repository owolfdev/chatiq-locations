"use client";

import { useEffect } from "react";

export function RegisterPwa() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* install is optional; the page still works in the browser */
    });
  }, []);
  return null;
}
