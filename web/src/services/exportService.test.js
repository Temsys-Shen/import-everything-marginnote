import { describe, expect, it } from "vitest";
import { prepareKaTeXForExport } from "./exportService";

describe("prepareKaTeXForExport", () => {
  it("shows KaTeX MathML and removes the HTML fallback copy", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <span class="katex">
        <span class="katex-mathml" style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);">
          <math><semantics><mrow><mi>x</mi></mrow></semantics></math>
        </span>
        <span class="katex-html" aria-hidden="true">
          <span class="base">x</span>
        </span>
      </span>
    `;

    prepareKaTeXForExport(root);

    const mathml = root.querySelector(".katex-mathml");
    expect(mathml).not.toBeNull();
    expect(mathml.style.position).toBe("static");
    expect(mathml.style.width).toBe("auto");
    expect(mathml.style.height).toBe("auto");
    expect(mathml.style.overflow).toBe("visible");
    expect(mathml.style.clipPath).toBe("none");
    expect(root.querySelector(".katex-html")).toBeNull();
  });
});
