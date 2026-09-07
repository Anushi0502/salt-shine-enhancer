import { describe, expect, it } from "vitest";

import {
  OPEN_IMAGES_LABEL_RULES,
  parseCsvLine,
  stableSplit,
} from "./build-open-images-visual-taxonomy-manifest.mjs";

describe("Open Images visual taxonomy manifest", () => {
  it("parses quoted metadata fields without losing commas", () => {
    expect(parseCsvLine('id,train,"https://example.test/image.jpg","https://example.test/item","https://creativecommons.org/licenses/by/2.0/","author","Name","A, useful title",123,md5'))
      .toEqual(["id", "train", "https://example.test/image.jpg", "https://example.test/item", "https://creativecommons.org/licenses/by/2.0/", "author", "Name", "A, useful title", "123", "md5"]);
  });

  it("uses stable product-taxonomy mappings and a deterministic split", () => {
    expect(OPEN_IMAGES_LABEL_RULES.Backpack[0]).toBe("backpacks");
    expect(OPEN_IMAGES_LABEL_RULES["T-shirt"][0]).toBe("t-shirts");
    expect(["train", "validation", "test"]).toContain(stableSplit("open-images-test"));
    expect(stableSplit("open-images-test")).toBe(stableSplit("open-images-test"));
  });
});
