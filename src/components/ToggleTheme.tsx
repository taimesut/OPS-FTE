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
    <label
      className="swap swap-rotate relative z-50 inline-flex min-h-11 min-w-11 cursor-pointer touch-manipulation items-center justify-center rounded-xl p-2"
      aria-label={`Chuyển sang giao diện ${theme === "light" ? "tối" : "sáng"}`}
    >
      <input
        type="checkbox"
        checked={theme === "dark"}
        onChange={toggleTheme}
        className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0"
      />

      {/* Sun */}

      <Sun className="swap-off pointer-events-none h-6 w-6 fill-current" />
      {/* Moon */}

      <Moon className="swap-on pointer-events-none h-6 w-6 fill-current" />
    </label>
  );
}
