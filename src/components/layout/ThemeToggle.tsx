import { MoonStar, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="group relative inline-flex h-10 w-20 items-center rounded-full border border-border bg-card p-1 transition-colors hover:border-primary/60"
      aria-label="Toggle color theme"
      title="Toggle color theme"
    >
      <span
        className={`absolute left-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-soft transition-transform duration-300 ${
          theme === "dark" ? "translate-x-10" : "translate-x-0"
        }`}
      >
        {theme === "dark" ? <MoonStar className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </span>
      <span className="grid w-full grid-cols-2 text-xs font-bold text-muted-foreground">
        <span className="text-center">L</span>
        <span className="text-center">D</span>
      </span>
    </button>
  );
};

export default ThemeToggle;
