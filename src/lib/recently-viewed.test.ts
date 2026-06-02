import { beforeEach, describe, expect, it } from "vitest";
import {
  readRecentlyViewedHandles,
  rememberRecentlyViewedHandle,
  RECENTLY_VIEWED_LIMIT,
} from "@/lib/recently-viewed";

describe("recently viewed history", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("stores the newest handle first and removes duplicates", () => {
    expect(rememberRecentlyViewedHandle("Alpha")).toEqual(["alpha"]);
    expect(rememberRecentlyViewedHandle("Beta")).toEqual(["beta", "alpha"]);
    expect(rememberRecentlyViewedHandle("ALPHA")).toEqual(["alpha", "beta"]);
    expect(readRecentlyViewedHandles()).toEqual(["alpha", "beta"]);
  });

  it("caps the history length to the configured limit", () => {
    for (let index = 0; index < RECENTLY_VIEWED_LIMIT + 3; index += 1) {
      rememberRecentlyViewedHandle(`product-${index}`);
    }

    const handles = readRecentlyViewedHandles();

    expect(handles).toHaveLength(RECENTLY_VIEWED_LIMIT);
    expect(handles[0]).toBe(`product-${RECENTLY_VIEWED_LIMIT + 2}`);
    expect(handles.at(-1)).toBe("product-3");
  });
});

