import { describe, expect, it } from "vitest";
import { buildScopedThemeCss } from "./exportThemeService";

describe("export theme CSS scoping", () => {
  it("targets the themed document root itself", () => {
    const css = buildScopedThemeCss({
      styleId: "default",
      styleCss: "",
      fontRegistry: [],
    });

    expect(css).toContain('[data-export-theme-root="true"][data-export-style-id="default"].themed-document');
    expect(css).toContain('[data-export-theme-root="true"][data-export-style-id="default"].themed-document .content-html pre');
    expect(css).toContain("border-radius: 10px;");
    expect(css).toContain("padding: 10px;");
    expect(css).toContain('[data-export-theme-root="true"][data-export-style-id="default"].themed-document[data-image-preset-id="small"] .content-html img');
    expect(css).toContain("max-width: min(100%, 360px);");
    expect(css).not.toContain('[data-export-theme-root="true"][data-export-style-id="default"] .themed-document .content-html pre');
  });
});
