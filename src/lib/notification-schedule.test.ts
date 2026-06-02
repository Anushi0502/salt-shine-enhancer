import { describe, expect, it } from "vitest";
import {
  buildWeeklyNotificationPlan,
  getWeeklyNotificationWeekKey,
} from "@/lib/notification-schedule";

describe("weekly notification plan", () => {
  it("builds three future notifications across the upcoming week", () => {
    const now = new Date("2026-06-03T08:00:00.000Z");
    const randomValues = [0.02, 0.88, 0.19, 0.63, 0.41, 0.77, 0.11, 0.95, 0.34];
    let index = 0;

    const plan = buildWeeklyNotificationPlan({
      now,
      count: 3,
      random: () => {
        const value = randomValues[index];
        index += 1;
        return value ?? 0.5;
      },
    });

    expect(getWeeklyNotificationWeekKey(now)).toBe("2026-W23");
    expect(plan.weekKey).toBe("2026-W23");
    expect(plan.notifications).toHaveLength(3);
    expect(plan.notifications.map((entry) => entry.route)).toEqual([
      "/shop?collection=all-products",
      "/blog",
      "/contact",
    ]);

    const timestamps = plan.notifications.map((entry) => entry.scheduledAt.getTime());
    expect(timestamps).toEqual([...timestamps].sort((left, right) => left - right));
    timestamps.forEach((timestamp) => {
      expect(timestamp).toBeGreaterThan(now.getTime());
      expect(timestamp).toBeLessThanOrEqual(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    });
  });
});

