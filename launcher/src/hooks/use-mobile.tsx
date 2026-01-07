import * as React from "react";

const MOBILE_BREAKPOINT = 768;

function isTauriDesktop() {
  const w = window as any;
  // Tauri 2.x / 1.x Indikatoren (je nach Build)
  return !!(w.__TAURI__ || w.__TAURI_INTERNALS__ || w.__TAURI_IPC__);
}

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    // ✅ Tauri Desktop: niemals "mobile" -> verhindert Sheet/Overlay Click-Block
    if (isTauriDesktop()) {
      setIsMobile(false);
      return;
    }

    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const onChange = () => setIsMobile(mql.matches);

    onChange();
    mql.addEventListener?.("change", onChange);

    return () => {
      mql.removeEventListener?.("change", onChange);
    };
  }, []);

  return isMobile;
}
