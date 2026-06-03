import { App, type PluginListenerHandle } from "@capacitor/app";
import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { SplashScreen } from "@capacitor/splash-screen";

export const MOBILE_ROUTE_EVENT = "salt:navigate-route";

function normalizeRouteTarget(input: string, fallback = "/"): string {
  const raw = String(input || "").trim();
  if (!raw) {
    return fallback;
  }

  if (raw.startsWith("/")) {
    return raw;
  }

  if (raw.startsWith("?") || raw.startsWith("#")) {
    return `${fallback}${raw}`;
  }

  try {
    const parsed = raw.startsWith("//") ? new URL(`https:${raw}`) : new URL(raw);
    const path = `${parsed.pathname}${parsed.search}${parsed.hash}` || fallback;

    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return path;
    }

    const combined = `${parsed.host}${path}`.replace(/^\/+/, "");
    return combined ? `/${combined}` : fallback;
  } catch {
    return `/${raw.replace(/^\/+/, "")}`;
  }
}

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

export function getNativePlatform(): string {
  return Capacitor.getPlatform();
}

export function normalizeAppRoute(input: string, fallback = "/"): string {
  return normalizeRouteTarget(input, fallback);
}

export function emitAppRoute(input: string): void {
  if (typeof window === "undefined") {
    return;
  }

  const route = normalizeAppRoute(input);
  window.dispatchEvent(
    new CustomEvent<string>(MOBILE_ROUTE_EVENT, {
      detail: route,
    }),
  );
}

export function subscribeToAppRoute(handler: (route: string) => void): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const listener = (event: Event) => {
    const customEvent = event as CustomEvent<string>;
    const route = normalizeAppRoute(customEvent.detail || "/");
    if (!route) {
      return;
    }

    handler(route);
  };

  window.addEventListener(MOBILE_ROUTE_EVENT, listener as EventListener);

  return () => {
    window.removeEventListener(MOBILE_ROUTE_EVENT, listener as EventListener);
  };
}

export async function openExternalUrl(url: string): Promise<void> {
  const target = String(url || "").trim();
  if (!target) {
    return;
  }

  if (isNativeApp()) {
    await Browser.open({ url: target });
    return;
  }

  if (typeof window !== "undefined") {
    window.location.assign(target);
  }
}

export async function readBooleanPreference(key: string, fallback = false): Promise<boolean> {
  const { value } = await Preferences.get({ key });
  if (value == null) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  return fallback;
}

export async function writeBooleanPreference(key: string, value: boolean): Promise<void> {
  await Preferences.set({ key, value: value ? "true" : "false" });
}

export async function readTextPreference(key: string): Promise<string | null> {
  const { value } = await Preferences.get({ key });
  return value ?? null;
}

export async function writeTextPreference(key: string, value: string): Promise<void> {
  await Preferences.set({ key, value: String(value) });
}

export async function removePreference(key: string): Promise<void> {
  await Preferences.remove({ key });
}

export async function observeAppUrlOpen(
  handler: (route: string, url: string) => void,
): Promise<PluginListenerHandle> {
  return App.addListener("appUrlOpen", (event) => {
    const route = normalizeAppRoute(event.url);
    handler(route, event.url);
  });
}

export async function hideNativeLaunchSplash(): Promise<void> {
  if (!isNativeApp()) {
    return;
  }

  try {
    await SplashScreen.hide({ fadeOutDuration: 260 });
  } catch {
    // Ignore splash errors so the app can continue rendering.
  }
}
