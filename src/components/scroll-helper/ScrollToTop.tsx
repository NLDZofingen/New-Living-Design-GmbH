import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export default function ScrollToTop() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash.startsWith("#") && hash.length > 1 && hash.length <= 2049) {
      try {
        const id = decodeURIComponent(hash.slice(1));
        const target = id.length > 0 && id.length <= 256 ? document.getElementById(id) : null;
        if (target) {
          target.scrollIntoView({ behavior: "auto", block: "start" });
          return;
        }
      } catch {
        // Ungültige Prozentkodierung: wie ohne Anker zum Seitenanfang springen.
      }
    }
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, [pathname, hash]);
  return null;
}
