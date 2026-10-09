"use client";
import { useEffect, useState, useSyncExternalStore } from "react";

export function useMediaQuery(query: string, serverValue = false): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", cb);
      return () => mql.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => serverValue,
  );
}

export const useIsMobile = () => useMediaQuery("(max-width: 767px)");
export const useReducedMotion = () => useMediaQuery("(prefers-reduced-motion: reduce)");

/** null while unknown (SSR / first paint). */
export function useWebGLSupport(): boolean | null {
  const [ok, setOk] = useState<boolean | null>(null);
  useEffect(() => {
    let supported = false;
    try {
      const c = document.createElement("canvas");
      supported = Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
    } catch {
      supported = false;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOk(supported);
  }, []);
  return ok;
}
