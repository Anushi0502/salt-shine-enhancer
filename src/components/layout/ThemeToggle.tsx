import { MoonStar, Sun } from "lucide-react";
import { useTheme } from "@/lib/theme";

const ThemeToggle = () => {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="group relative inline-flex h-10 w-20 items-center rounded-full border border-border/80 bg-card/92 p-1 shadow-[0_14px_24px_-22px_rgba(0,0,0,0.55)] transition hover:border-primary/60 hover:shadow-[0_18px_30px_-24px_hsl(var(--primary)/0.8)]"
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
      <span className="grid w-full grid-cols-2 text-[0.62rem] font-extrabold uppercase tracking-[0.1em] text-muted-foreground">
        <span className={`text-center transition ${theme === "light" ? "text-foreground" : "text-muted-foreground"}`}>Light</span>
        <span className={`text-center transition ${theme === "dark" ? "text-foreground" : "text-muted-foreground"}`}>Dark</span>
      </span>
    </button>
  );
};

export default ThemeToggle;
