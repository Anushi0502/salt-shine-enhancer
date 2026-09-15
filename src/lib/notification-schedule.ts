import { getISOWeek } from "date-fns/getISOWeek";
import { getISOWeekYear } from "date-fns/getISOWeekYear";

const MILLIS_PER_DAY = 24 * 60 * 60 * 1000;

export interface WeeklyNotificationTemplate {
  route: string;
  title: string;
  body: string;
}

export interface WeeklyNotificationPlanEntry extends WeeklyNotificationTemplate {
  id: number;
  scheduledAt: Date;
}

export interface WeeklyNotificationPlan {
  weekKey: string;
  notifications: WeeklyNotificationPlanEntry[];
}

export interface BuildWeeklyNotificationPlanOptions {
  now?: Date;
  count?: number;
  random?: () => number;
}

export interface SerializedWeeklyNotificationPlan {
  weekKey: string;
  notifications: Array<Omit<WeeklyNotificationPlanEntry, "scheduledAt"> & { scheduledAt: string }>;
}

const WEEKLY_NOTIFICATION_TEMPLATES: WeeklyNotificationTemplate[] = [
  {
    route: "/shop?collection=all-products",
    title: "New SALT picks are live",
    body: "Browse live Shopify stock before the next drop.",
  },
  {
    route: "/blog",
    title: "Fresh SALT stories",
    body: "Open the latest reads and product highlights.",
  },
  {
    route: "/contact",
    title: "Need help from SALT?",
    body: "Support is one tap away if you need help with an order.",
  },
  {
    route: "/collections",
    title: "Explore every collection",
    body: "Jump back into the catalog with live product groups.",
  },
  {
    route: "/cart",
    title: "Your cart is waiting",
    body: "Review saved items and finish checkout when you are ready.",
  },
  {
    route: "/wishlist",
    title: "Saved for later",
    body: "Revisit items you want to keep an eye on.",
  },
];

function asDate(value: Date | string): Date {
  return value instanceof Date ? new Date(value.getTime()) : new Date(value);
}

function clampCount(count: number): number {
  if (!Number.isFinite(count) || count < 1) {
    return 0;
  }

  return Math.min(6, Math.floor(count));
}

function hashNotificationId(weekKey: string, slotIndex: number, route: string): number {
  let hash = 0x811c9dc5;
  const input = `${weekKey}:${slotIndex}:${route}`;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  const normalized = hash >>> 0;
  return (normalized % 2_000_000_000) + 1;
}

function getSlotDayOffset(slotIndex: number): number {
  return Math.min(6, slotIndex * 2 + 1);
}

function getSlotHour(slotIndex: number): number {
  const hours = [9, 13, 18, 11, 15, 19];
  return hours[slotIndex % hours.length];
}

function pickRouteTemplate(random: () => number, usedRoutes: Set<string>): WeeklyNotificationTemplate {
  const idealIndex = Math.round(random() * (WEEKLY_NOTIFICATION_TEMPLATES.length - 1));

  for (let offset = 0; offset < WEEKLY_NOTIFICATION_TEMPLATES.length; offset += 1) {
    const candidate = WEEKLY_NOTIFICATION_TEMPLATES[(idealIndex + offset) % WEEKLY_NOTIFICATION_TEMPLATES.length];
    if (!usedRoutes.has(candidate.route)) {
      usedRoutes.add(candidate.route);
      return candidate;
    }
  }

  const fallback = WEEKLY_NOTIFICATION_TEMPLATES[idealIndex] ?? WEEKLY_NOTIFICATION_TEMPLATES[0];
  usedRoutes.add(fallback.route);
  return fallback;
}

function buildNotificationTime(now: Date, slotIndex: number, random: () => number): Date {
  const scheduledAt = asDate(now);
  scheduledAt.setMilliseconds(0);
  scheduledAt.setSeconds(0);
  scheduledAt.setDate(scheduledAt.getDate() + getSlotDayOffset(slotIndex));
  scheduledAt.setHours(getSlotHour(slotIndex), Math.floor(random() * 60), 0, 0);

  if (scheduledAt.getTime() <= now.getTime()) {
    scheduledAt.setTime(now.getTime() + (slotIndex + 1) * 60 * 60 * 1000);
  }

  const weekEnd = now.getTime() + 7 * MILLIS_PER_DAY;
  if (scheduledAt.getTime() > weekEnd) {
    scheduledAt.setTime(weekEnd - (6 - slotIndex) * 60 * 60 * 1000);
  }

  return scheduledAt;
}

export function getWeeklyNotificationWeekKey(now: Date): string {
  const date = asDate(now);
  const weekYear = getISOWeekYear(date);
  const weekNumber = String(getISOWeek(date)).padStart(2, "0");
  return `${weekYear}-W${weekNumber}`;
}

export function buildWeeklyNotificationPlan({
  now = new Date(),
  count = 3,
  random = Math.random,
}: BuildWeeklyNotificationPlanOptions = {}): WeeklyNotificationPlan {
  const notificationCount = clampCount(count);
  const weekKey = getWeeklyNotificationWeekKey(now);

  if (notificationCount === 0) {
    return { weekKey, notifications: [] };
  }

  const usedRoutes = new Set<string>();
  const notifications: WeeklyNotificationPlanEntry[] = Array.from({ length: notificationCount }, (_value, slotIndex) => {
    const template = pickRouteTemplate(random, usedRoutes);
    const scheduledAt = buildNotificationTime(now, slotIndex, random);

    return {
      id: hashNotificationId(weekKey, slotIndex, template.route),
      route: template.route,
      title: template.title,
      body: template.body,
      scheduledAt,
    };
  }).sort((left, right) => left.scheduledAt.getTime() - right.scheduledAt.getTime());

  return { weekKey, notifications };
}

export function serializeWeeklyNotificationPlan(plan: WeeklyNotificationPlan): string {
  const payload: SerializedWeeklyNotificationPlan = {
    weekKey: plan.weekKey,
    notifications: plan.notifications.map((entry) => ({
      ...entry,
      scheduledAt: entry.scheduledAt.toISOString(),
    })),
  };

  return JSON.stringify(payload);
}

export function parseWeeklyNotificationPlan(raw: string | null | undefined): WeeklyNotificationPlan | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as SerializedWeeklyNotificationPlan;
    if (!parsed || typeof parsed !== "object" || typeof parsed.weekKey !== "string") {
      return null;
    }

    const notifications = Array.isArray(parsed.notifications)
      ? parsed.notifications.flatMap((entry) => {
          if (
            !entry ||
            typeof entry !== "object" ||
            typeof entry.id !== "number" ||
            typeof entry.route !== "string" ||
            typeof entry.title !== "string" ||
            typeof entry.body !== "string" ||
            typeof entry.scheduledAt !== "string"
          ) {
            return [];
          }

          const scheduledAt = new Date(entry.scheduledAt);
          if (Number.isNaN(scheduledAt.getTime())) {
            return [];
          }

          return [
            {
              id: entry.id,
              route: entry.route,
              title: entry.title,
              body: entry.body,
              scheduledAt,
            },
          ];
        })
      : [];

    return {
      weekKey: parsed.weekKey,
      notifications,
    };
  } catch {
    return null;
  }
}
