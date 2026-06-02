import { LocalNotifications, type ActionPerformed, type LocalNotificationSchema } from "@capacitor/local-notifications";
import OneSignal, { LogLevel } from "@onesignal/capacitor-plugin";
import { buildWeeklyNotificationPlan, getWeeklyNotificationWeekKey, parseWeeklyNotificationPlan, serializeWeeklyNotificationPlan, type WeeklyNotificationPlan } from "@/lib/notification-schedule";
import {
  emitAppRoute,
  getNativePlatform,
  isNativeApp,
  normalizeAppRoute,
  openExternalUrl,
  readBooleanPreference,
  readTextPreference,
  removePreference,
  writeBooleanPreference,
  writeTextPreference,
} from "@/lib/mobile";
import { getShopBaseOrigin } from "@/lib/theme-assets";

const PUSH_PREFERENCE_KEY = "salt-push-notifications-enabled";
const WEEKLY_NOTIFICATION_PLAN_KEY = "salt-weekly-notification-plan";
const WEEKLY_NOTIFICATION_CHANNEL_ID = "salt-weekly-notifications";
const WEEKLY_NOTIFICATION_KIND = "salt-weekly-notification";
const ONE_SIGNAL_APP_ID = String(import.meta.env.VITE_ONESIGNAL_APP_ID || "").trim();

let initPromise: Promise<void> | null = null;
let syncPromise: Promise<boolean> | null = null;
let notificationChannelPromise: Promise<void> | null = null;
let localNotificationListenersRegistered = false;

type NotificationPayload = Record<string, unknown> & {
  notification?: Record<string, unknown>;
};

type NotificationTarget =
  | { kind: "route"; value: string }
  | { kind: "external"; value: string }
  | null;

type WeeklyNotificationExtra = {
  kind: string;
  weekKey?: string;
  route?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(input: unknown): string {
  return typeof input === "string" ? input.trim() : "";
}

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

function resolveNotificationTarget(payload: NotificationPayload | ActionPerformed | null | undefined): NotificationTarget {
  if (!payload) {
    return null;
  }

  const notification = (payload.notification && typeof payload.notification === "object"
    ? payload.notification
    : payload) as Record<string, unknown>;

  const additionalData = isRecord(notification.additionalData)
    ? notification.additionalData
    : isRecord(notification.data)
      ? notification.data
      : isRecord(notification.extra)
        ? notification.extra
        : {};

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

function isWeeklyNotificationExtra(value: unknown): value is WeeklyNotificationExtra {
  return isRecord(value) && value.kind === WEEKLY_NOTIFICATION_KIND;
}

function notificationExtraForRoute(route: string, weekKey: string): WeeklyNotificationExtra {
  return {
    kind: WEEKLY_NOTIFICATION_KIND,
    weekKey,
    route,
  };
}

async function ensureNativeNotificationChannel(): Promise<void> {
  if (!isNativeApp() || getNativePlatform() !== "android") {
    return;
  }

  if (!notificationChannelPromise) {
    notificationChannelPromise = (async () => {
      try {
        await LocalNotifications.createChannel({
          id: WEEKLY_NOTIFICATION_CHANNEL_ID,
          name: "SALT weekly notifications",
          description: "Random weekly reminders and updates from the store",
          importance: 4,
          visibility: 1,
        });
      } catch {
        // Channel creation is best-effort. The schedule still works with the platform default.
      }
    })();
  }

  await notificationChannelPromise;
}

async function installNotificationListeners(): Promise<void> {
  if (localNotificationListenersRegistered) {
    return;
  }

  localNotificationListenersRegistered = true;

  await LocalNotifications.addListener("localNotificationActionPerformed", (event) => {
    const target = resolveNotificationTarget(event);
    if (!target) {
      return;
    }

    if (target.kind === "route") {
      emitAppRoute(target.value);
      return;
    }

    void openExternalUrl(target.value);
  });
}

async function ensureNotificationRuntimeInitialized(): Promise<void> {
  if (!isNativeApp()) {
    return;
  }

  if (!initPromise) {
    initPromise = (async () => {
      const plugin = OneSignal as unknown as {
        Debug?: { setLogLevel?: (level: LogLevel) => void };
        initialize?: (appId: string) => void;
        Notifications?: {
          addClickListener?: (listener: (event: unknown) => void) => void;
        };
      };

      if (import.meta.env.DEV) {
        plugin.Debug?.setLogLevel?.(LogLevel.Verbose);
      }

      if (ONE_SIGNAL_APP_ID) {
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
      }

      await ensureNativeNotificationChannel();
      await installNotificationListeners();
    })();
  }

  await initPromise;
}

async function requestLocalNotificationPermission(promptForPermission: boolean): Promise<boolean> {
  try {
    const status = await LocalNotifications.checkPermissions();
    if (status.display === "granted") {
      return true;
    }

    if (!promptForPermission) {
      return false;
    }

    const requested = await LocalNotifications.requestPermissions();
    return requested.display === "granted";
  } catch {
    return false;
  }
}

async function cancelWeeklyNotifications(options?: { keepIds?: Set<number> }): Promise<void> {
  if (!isNativeApp()) {
    return;
  }

  try {
    const pending = await LocalNotifications.getPending();
    const notifications = pending.notifications
      .filter((notification) => isWeeklyNotificationExtra(notification.extra))
      .filter((notification) => !options?.keepIds?.has(notification.id))
      .map((notification) => ({ id: notification.id }));

    if (notifications.length) {
      await LocalNotifications.cancel({ notifications });
    }
  } catch {
    // Best effort cleanup. The next sync can overwrite the remaining schedule.
  }
}

async function loadStoredWeeklyNotificationPlan(): Promise<WeeklyNotificationPlan | null> {
  const rawPlan = await readTextPreference(WEEKLY_NOTIFICATION_PLAN_KEY);
  return parseWeeklyNotificationPlan(rawPlan);
}

async function persistWeeklyNotificationPlan(plan: WeeklyNotificationPlan): Promise<void> {
  await writeTextPreference(WEEKLY_NOTIFICATION_PLAN_KEY, serializeWeeklyNotificationPlan(plan));
}

function shouldReuseStoredPlan(plan: WeeklyNotificationPlan | null, currentWeekKey: string, now: Date): plan is WeeklyNotificationPlan {
  if (!plan || plan.weekKey !== currentWeekKey || plan.notifications.length === 0) {
    return false;
  }

  return plan.notifications.every((notification) => notification.scheduledAt.getTime() > now.getTime());
}

async function scheduleWeeklyNotificationPlan(plan: WeeklyNotificationPlan): Promise<void> {
  const notifications: LocalNotificationSchema[] = plan.notifications.map((notification) => ({
    id: notification.id,
    title: notification.title,
    body: notification.body,
    schedule: {
      at: notification.scheduledAt,
      allowWhileIdle: true,
    },
    channelId: WEEKLY_NOTIFICATION_CHANNEL_ID,
    extra: notificationExtraForRoute(notification.route, plan.weekKey),
  }));

  await LocalNotifications.schedule({ notifications });
}

export async function getPushNotificationsEnabled(): Promise<boolean> {
  return readBooleanPreference(PUSH_PREFERENCE_KEY, false);
}

export async function syncWeeklyNotifications(options?: { now?: Date }): Promise<boolean> {
  if (!isNativeApp()) {
    return false;
  }

  if (!syncPromise) {
    syncPromise = (async () => {
      try {
        await ensureNotificationRuntimeInitialized();

        const desired = await readBooleanPreference(PUSH_PREFERENCE_KEY, false);
        if (!desired) {
          await cancelWeeklyNotifications();
          await removePreference(WEEKLY_NOTIFICATION_PLAN_KEY);
          return false;
        }

        const permissionAccepted = await requestLocalNotificationPermission(false);
        if (!permissionAccepted) {
          await writeBooleanPreference(PUSH_PREFERENCE_KEY, false);
          await cancelWeeklyNotifications();
          await removePreference(WEEKLY_NOTIFICATION_PLAN_KEY);
          return false;
        }

        const now = options?.now ? new Date(options.now) : new Date();
        const weekKey = getWeeklyNotificationWeekKey(now);
        const storedPlan = await loadStoredWeeklyNotificationPlan();
        const plan = shouldReuseStoredPlan(storedPlan, weekKey, now)
          ? storedPlan
          : buildWeeklyNotificationPlan({ now, count: 3, random: Math.random });

        await scheduleWeeklyNotificationPlan(plan);
        await cancelWeeklyNotifications({ keepIds: new Set(plan.notifications.map((notification) => notification.id)) });
        await persistWeeklyNotificationPlan(plan);
        return true;
      } catch {
        return false;
      } finally {
        syncPromise = null;
      }
    })();
  }

  return syncPromise;
}

export async function setPushNotificationsEnabled(enabled: boolean): Promise<boolean> {
  const desired = Boolean(enabled);

  if (!isNativeApp()) {
    await writeBooleanPreference(PUSH_PREFERENCE_KEY, desired);
    return desired;
  }

  await ensureNotificationRuntimeInitialized();

  if (desired) {
    const accepted = await requestLocalNotificationPermission(true);
    if (!accepted) {
      await writeBooleanPreference(PUSH_PREFERENCE_KEY, false);
      await cancelWeeklyNotifications();
      await removePreference(WEEKLY_NOTIFICATION_PLAN_KEY);
      return false;
    }

    await writeBooleanPreference(PUSH_PREFERENCE_KEY, true);
    await syncWeeklyNotifications();
    return true;
  }

  await writeBooleanPreference(PUSH_PREFERENCE_KEY, false);
  await cancelWeeklyNotifications();
  await removePreference(WEEKLY_NOTIFICATION_PLAN_KEY);
  return false;
}

export async function initializePushNotifications(options?: {
  promptForPermission?: boolean;
}): Promise<boolean> {
  if (!isNativeApp()) {
    return readBooleanPreference(PUSH_PREFERENCE_KEY, false);
  }

  await ensureNotificationRuntimeInitialized();

  if (options?.promptForPermission) {
    return requestLocalNotificationPermission(true);
  }

  return readBooleanPreference(PUSH_PREFERENCE_KEY, false);
}
