import { describe, expect, it } from "vitest";
import { buildMindmapImportProgressModel, buildMindmapParseProgressModel } from "./progressModel";

describe("buildMindmapParseProgressModel", () => {
  it("returns null when there is neither progress nor activity", () => {
    expect(buildMindmapParseProgressModel(null, "a.xmind", false)).toBeNull();
  });

  it("maps image extraction steps into the middle of the bar", () => {
    const model = buildMindmapParseProgressModel({
      phase: "images",
      current: 5,
      total: 10,
      message: "正在提取图片 5/10",
    }, "a.xmind", true);

    expect(model.message).toBe("正在提取图片 5/10");
    expect(model.targetPercent).toBeGreaterThan(20);
    expect(model.targetPercent).toBeLessThan(96);
    expect(model.indeterminate).toBe(false);
  });

  it("finishes at 100%", () => {
    const model = buildMindmapParseProgressModel({ phase: "done" }, "a.xmind", true);

    expect(model.targetPercent).toBe(100);
  });

  it("starts at 0% while idle", () => {
    const model = buildMindmapParseProgressModel(null, "a.xmind", true);

    expect(model.targetPercent).toBe(0);
    expect(model.message).toBe("等待解析");
  });
});

describe("buildMindmapImportProgressModel", () => {
  it("passes indeterminate through for the submit phase", () => {
    const model = buildMindmapImportProgressModel({
      phase: "submit",
      indeterminate: true,
      message: "正在准备导入数据（143 张图片）",
    }, "a.xmind", true);

    expect(model.indeterminate).toBe(true);
    expect(model.message).toBe("正在准备导入数据（143 张图片）");
    // 没有 current/total 时停在 submit 区间起点
    expect(model.targetPercent).toBe(1);
  });

  it("advances while converting images during submit", () => {
    const model = buildMindmapImportProgressModel({
      phase: "submit",
      current: 143,
      total: 143,
      message: "正在准备导入数据 143/143",
    }, "a.xmind", true);

    expect(model.targetPercent).toBeCloseTo(8, 5);
    expect(model.indeterminate).toBe(false);
  });

  it("spreads card creation across the import range", () => {
    const model = buildMindmapImportProgressModel({
      phase: "import",
      current: 1,
      total: 2,
      message: "正在导入脑图 1/2",
    }, "a.xmind", true);

    expect(model.targetPercent).toBeGreaterThan(5);
    expect(model.targetPercent).toBeLessThan(98);
    expect(model.indeterminate).toBe(false);
  });

  it("finishes at 100%", () => {
    const model = buildMindmapImportProgressModel({ phase: "done", current: 1, total: 1 }, "a.xmind", true);

    expect(model.targetPercent).toBe(100);
  });
});
