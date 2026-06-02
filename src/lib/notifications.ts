import OneSignal, { LogLevel } from "@onesignal/capacitor-plugin";
import { getShopBaseOrigin } from "@/lib/theme-assets";
import {
  emitAppRoute,
  isNativeApp,
  normalizeAppRoute,
  openExternalUrl,
  readBooleanPreference,
  writeBooleanPreference,
} from "@/lib/mobile";

const PUSH_PREFERENCE_KEY = "salt-push-notifications-enabled";
const ONE_SIGNAL_APP_ID = String(import.meta.env.VITE_ONESIGNAL_APP_ID || "").trim();

let initPromise: Promise<void> | null = null;

type NotificationPayload = Record<string, unknown> & {
  notification?: Record<string, unknown>;
};

type NotificationTarget =
  | { kind: "route"; value: string }
  | { kind: "external"; value: string }
  | null;

function getPushSubscriptionApi(): { optIn?: () => Promise<void> | void; optOut?: () => Promise<void> | void } | null {
  const plugin = OneSignal as unknown as {
    User?: {
      pushSubscription?: {
        optIn?: () => Promise<void> | void;
        optOut?: () => Promise<void> | void;
      };
      PushSubscription?: {
        optIn?: () => Promise<void> | void;
        optOut?: () => Promise<void> | void;
      };
    };
  };

  return plugin.User?.pushSubscription || plugin.User?.PushSubscription || null;
}

function readString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

function parseUrlCandidate(raw: string): NotificationTarget {
  const candidate = String(raw || "").trim();
  if (!candidate) {
    return null;
  }

  if (/^(mailto:|tel:|sms:|geo:)/i.test(candidate)) {
    return { kind: "external", value: candidate };
  }

  if (candidate.startsWith("/")) {
    return { kind: "route", value: normalizeAppRoute(candidate) };
  }

  try {
    const parsed = candidate.startsWith("//") ? new URL(`https:${candidate}`) : new URL(candidate);
    const normalizedShopOrigin = new URL(getShopBaseOrigin());
    const parsedOrigin = `${parsed.protocol}//${parsed.host}`;
    const shopOrigin = `${normalizedShopOrigin.protocol}//${normalizedShopOrigin.host}`;

    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      if (parsedOrigin === shopOrigin) {
        return {
          kind: "route",
          value: normalizeAppRoute(`${parsed.pathname}${parsed.search}${parsed.hash}` || "/"),
        };
      }

      return { kind: "external", value: parsed.toString() };
    }

    return {
      kind: "route",
      value: normalizeAppRoute(`${parsed.host}${parsed.pathname}${parsed.search}${parsed.hash}`),
    };
  } catch {
    return { kind: "route", value: normalizeAppRoute(candidate) };
  }
}

function resolveNotificationTarget(payload: NotificationPayload | null | undefined): NotificationTarget {
  if (!payload) {
    return null;
  }

  const notification = (payload.notification && typeof payload.notification === "object"
    ? payload.notification
    : payload) as Record<string, unknown>;
  const additionalData = (notification.additionalData && typeof notification.additionalData === "object"
    ? notification.additionalData
    : notification.data && typeof notification.data === "object"
      ? notification.data
      : {}) as Record<string, unknown>;

  const candidate =
    readString(additionalData.deep_link) ||
    readString(additionalData.route) ||
    readString(additionalData.path) ||
    readString(additionalData.url) ||
    readString(notification.launchUrl) ||
    readString(notification.launchURL) ||
    readString(notification.app_url) ||
    readString(notification.appUrl) ||
    readString(notification.web_url) ||
    readString(notification.webUrl) ||
    readString(notification.url);

  if (!candidate) {
    return null;
  }

  return parseUrlCandidate(candidate);
}

async function applyPushSubscription(enabled: boolean): Promise<void> {
  if (!isNativeApp() || !ONE_SIGNAL_APP_ID) {
    return;
  }

  const subscription = getPushSubscriptionApi();
  if (!subscription) {
    return;
  }

  if (enabled) {
    await subscription.optIn?.();
  } else {
    await subscription.optOut?.();
  }
}

export async function getPushNotificationsEnabled(): Promise<boolean> {
  return readBooleanPreference(PUSH_PREFERENCE_KEY, false);
}

export async function setPushNotificationsEnabled(enabled: boolean): Promise<boolean> {
  const desired = Boolean(enabled);
  if (!isNativeApp() || !ONE_SIGNAL_APP_ID) {
    await writeBooleanPreference(PUSH_PREFERENCE_KEY, desired);
    return desired;
  }

  if (desired) {
    const accepted = await initializePushNotifications({ promptForPermission: true });
    if (!accepted) {
      await writeBooleanPreference(PUSH_PREFERENCE_KEY, false);
      await applyPushSubscription(false);
      return false;
    }

    await writeBooleanPreference(PUSH_PREFERENCE_KEY, true);
    await applyPushSubscription(true);
    return true;
  }

  await writeBooleanPreference(PUSH_PREFERENCE_KEY, false);
  await applyPushSubscription(false);
  return false;
}

export async function initializePushNotifications(options?: {
  promptForPermission?: boolean;
}): Promise<boolean> {
  if (!isNativeApp() || !ONE_SIGNAL_APP_ID) {
    return readBooleanPreference(PUSH_PREFERENCE_KEY, false);
  }

  if (!initPromise) {
    initPromise = (async () => {
      const plugin = OneSignal as unknown as {
        Debug?: { setLogLevel?: (level: LogLevel) => void };
        initialize?: (appId: string) => void;
        Notifications?: {
          requestPermission?: (fallbackToSettings?: boolean) => Promise<boolean>;
          addClickListener?: (listener: (event: unknown) => void) => void;
        };
      };

      if (import.meta.env.DEV) {
        plugin.Debug?.setLogLevel?.(LogLevel.Verbose);
      }

      plugin.initialize?.(ONE_SIGNAL_APP_ID);
      plugin.Notifications?.addClickListener?.((event: unknown) => {
        const target = resolveNotificationTarget(event as NotificationPayload);
        if (!target) {
          return;
        }

        if (target.kind === "route") {
          emitAppRoute(target.value);
          return;
        }

        void openExternalUrl(target.value);
      });
    })();
  }

  await initPromise;

  if (options?.promptForPermission) {
    const plugin = OneSignal as unknown as {
      Notifications?: {
        requestPermission?: (fallbackToSettings?: boolean) => Promise<boolean>;
      };
    };

    const accepted = await plugin.Notifications?.requestPermission?.(false);
    return Boolean(accepted);
  }

  return readBooleanPreference(PUSH_PREFERENCE_KEY, false);
}

export async function loadPushNotificationsEnabled(): Promise<boolean> {
  return getPushNotificationsEnabled();
}
