import {
  createContext,
  type PropsWithChildren,
  useEffect,
  useLayoutEffect,
  useContext,
  useMemo,
  useState,
} from "react";
import { getBrowserStorage } from "@/lib/browser-storage";

type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (value: Theme) => void;
  toggleTheme: () => void;
};

const THEME_STORAGE_KEY = "salt-ui-theme";
const THEME_COLOR_LIGHT = "#131921";
const THEME_COLOR_DARK = "#0f172a";
const THEME_MEDIA_QUERY = "(prefers-color-scheme: dark)";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): Theme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }

  return window.matchMedia(THEME_MEDIA_QUERY).matches ? "dark" : "light";
}

function resolveStoredTheme(): Theme | null {
  const storage = getBrowserStorage();
  const stored = storage?.getItem(THEME_STORAGE_KEY);

  if (stored === "light" || stored === "dark") {
    return stored;
  }

  return null;
}

function resolveInitialTheme(): Theme {
  return resolveStoredTheme() ?? getSystemTheme();
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const themeColor = theme === "dark" ? THEME_COLOR_DARK : THEME_COLOR_LIGHT;

  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }

  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.setAttribute("content", themeColor);
  }
}

export function ThemeProvider({ children }: PropsWithChildren) {
  const [theme, setThemeState] = useState<Theme>(resolveInitialTheme);
  const [isManualPreference, setIsManualPreference] = useState(() => resolveStoredTheme() !== null);

  useLayoutEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    const storage = getBrowserStorage();

    if (!storage) {
      return;
    }

    if (isManualPreference) {
      storage.setItem(THEME_STORAGE_KEY, theme);
      return;
    }

    storage.removeItem(THEME_STORAGE_KEY);
  }, [isManualPreference, theme]);

  useEffect(() => {
    if (isManualPreference || typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const media = window.matchMedia(THEME_MEDIA_QUERY);
    const handleChange = (event: MediaQueryListEvent) => {
      setThemeState(event.matches ? "dark" : "light");
    };

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", handleChange);
      return () => media.removeEventListener("change", handleChange);
    }

    media.addListener(handleChange);
    return () => media.removeListener(handleChange);
  }, [isManualPreference]);

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      setTheme: (nextTheme: Theme) => {
        setIsManualPreference(true);
        setThemeState(nextTheme);
      },
      toggleTheme: () => {
        setIsManualPreference(true);
        setThemeState((prev) => (prev === "light" ? "dark" : "light"));
      },
    }),
    [theme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}
