import { createContext, type PropsWithChildren, useLayoutEffect, useContext } from "react";

type ThemeContextValue = {
  theme: "light";
  setTheme: (value: "light") => void;
  toggleTheme: () => void;
};

const THEME_COLOR_LIGHT = "#f4f8ff";

const ThemeContext = createContext<ThemeContextValue | null>(null);

function applyTheme(): void {
  const root = document.documentElement;
  root.classList.remove("dark");

  root.dataset.theme = "light";
  root.style.colorScheme = "light";

  const themeMeta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.setAttribute("content", THEME_COLOR_LIGHT);
  }
}

export function ThemeProvider({ children }: PropsWithChildren) {
  useLayoutEffect(() => {
    applyTheme();
  }, []);

  const value: ThemeContextValue = {
    theme: "light",
    setTheme: () => {
      applyTheme();
    },
    toggleTheme: () => {
      applyTheme();
    },
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within ThemeProvider");
  }

  return context;
}
