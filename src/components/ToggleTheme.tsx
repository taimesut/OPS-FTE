import { Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";

const THEME_KEY = "theme";

export default function ToggleTheme() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [theme, setTheme] = useState(
    () => localStorage.getItem(THEME_KEY) || "light",
  );

  const applyTheme = (nextTheme: string) => {
    const scopedRoot = buttonRef.current?.closest("[data-ops-fte-theme-root]");
    if (scopedRoot) {
      scopedRoot.setAttribute("data-theme", nextTheme);
      return;
    }
    document.documentElement.setAttribute("data-theme", nextTheme);
  };

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={toggleTheme}
      aria-label={`Chuyển sang giao diện ${theme === "light" ? "tối" : "sáng"}`}
      aria-pressed={theme === "dark"}
      className="btn btn-square btn-ghost relative z-50 min-h-11 min-w-11 touch-manipulation rounded-xl p-2"
    >
      {theme === "light" ? (
        <Sun className="pointer-events-none h-6 w-6 fill-current" />
      ) : (
        <Moon className="pointer-events-none h-6 w-6 fill-current" />
      )}
    </button>
  );
}
