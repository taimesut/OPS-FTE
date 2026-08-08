import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const THEME_KEY = "theme";

export default function ToggleTheme() {
  const [theme, setTheme] = useState(
    () => localStorage.getItem(THEME_KEY) || "light",
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";

    setTheme(next);
    localStorage.setItem(THEME_KEY, next);
    document.documentElement.setAttribute("data-theme", next);
  };

  return (
    <button
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
