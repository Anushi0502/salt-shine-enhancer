export function getBrowserStorage(type: "localStorage" | "sessionStorage" = "localStorage"): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const storage = window[type];
    return typeof storage === "undefined" ? null : storage;
  } catch {
    return null;
  }
}
