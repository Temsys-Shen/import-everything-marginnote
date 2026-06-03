import { describe, expect, it } from "vitest";
import {
  DEFAULT_IMAGE_DISPLAY_PRESET_ID,
  IMAGE_DISPLAY_PRESETS,
  getImageDisplayPreset,
  normalizeImageDisplayPresetId,
} from "./imageDisplayPresets";

describe("image display presets", () => {
  it("keeps the four document image display presets stable", () => {
    expect(IMAGE_DISPLAY_PRESETS.map((preset) => preset.id)).toEqual([
      "fit-width",
      "large",
      "medium",
      "small",
    ]);
  });

  it("normalizes unknown preset ids to fit width", () => {
    expect(normalizeImageDisplayPresetId("medium")).toBe("medium");
    expect(normalizeImageDisplayPresetId("unknown")).toBe(DEFAULT_IMAGE_DISPLAY_PRESET_ID);
    expect(normalizeImageDisplayPresetId()).toBe(DEFAULT_IMAGE_DISPLAY_PRESET_ID);
  });

  it("resolves preset metadata from a normalized id", () => {
    expect(getImageDisplayPreset("small")).toMatchObject({
      id: "small",
      label: "小图",
    });
    expect(getImageDisplayPreset("missing")).toMatchObject({
      id: DEFAULT_IMAGE_DISPLAY_PRESET_ID,
    });
  });
});
