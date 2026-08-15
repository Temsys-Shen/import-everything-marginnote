import { describe, expect, it } from "vitest";
import { detectSourceType } from "./fileTypes";

describe("detectSourceType", () => {
  it("识别PDF文件", () => {
    expect(detectSourceType({ name: "报告.pdf", type: "application/pdf", size: 1 })).toBe("pdf");
  });
});
