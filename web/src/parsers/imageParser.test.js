import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { parseImageFile } from "./imageParser";
import { revokeAllObjectURLs } from "./objectUrlRegistry";

describe("parseImageFile", () => {
  const originalCreateObjectURL = URL.createObjectURL;

  beforeAll(() => {
    URL.createObjectURL = vi.fn(() => "blob:image-test");
  });

  afterEach(() => {
    revokeAllObjectURLs();
  });

  afterAll(() => {
    URL.createObjectURL = originalCreateObjectURL;
  });

  it("把图片渲染为单页figure，不在图片下方重复文件名", async () => {
    const result = await parseImageFile({
      name: "壁纸.png",
      size: 1024,
      lastModified: 1700000000000,
      webkitRelativePath: "",
    });

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].title).toBe("壁纸.png");
    expect(result.sections[0].html).toContain('src="blob:image-test"');
    expect(result.sections[0].html).not.toContain("<figcaption");
    expect(result.sections[0].html).not.toContain(">壁纸.png<");
  });
});
