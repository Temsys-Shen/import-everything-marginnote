import { describe, expect, it } from "vitest";
import { applyAdaptiveLayout } from "./widthAdaptService";

function defineLayoutMetric(element, key, value) {
  Object.defineProperty(element, key, {
    configurable: true,
    value,
  });
}

function defineRect(element, width, height) {
  element.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON() {
      return {};
    },
  });
}

describe("applyAdaptiveLayout", () => {
  it("scales pptx slide containers to the available frame width", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div class="content-html">
        <article class="pptx-slide-shell">
          <div class="pptx-slide-frame">
            <div class="slide-container"></div>
          </div>
        </article>
      </div>
    `;
    document.body.appendChild(root);

    const frame = root.querySelector(".pptx-slide-frame");
    const slide = root.querySelector(".slide-container");

    defineLayoutMetric(frame, "clientWidth", 720);
    defineLayoutMetric(slide, "scrollWidth", 960);
    defineLayoutMetric(slide, "scrollHeight", 540);
    defineRect(slide, 960, 540);

    const cleanup = applyAdaptiveLayout(root);
    const wrapper = frame.querySelector("[data-export-scale-wrapper='true']");

    expect(wrapper).not.toBeNull();
    expect(wrapper.firstElementChild).toBe(slide);
    expect(wrapper.style.width).toBe("718px");
    expect(wrapper.style.height).toBe("403.875px");
    expect(slide.style.width).toBe("960px");
    expect(slide.style.maxWidth).toBe("none");
    expect(slide.style.transform).toBe("scale(0.7479166666666667)");

    cleanup();

    expect(frame.querySelector("[data-export-scale-wrapper='true']")).toBeNull();
    expect(frame.firstElementChild).toBe(slide);
    expect(slide.style.transform).toBe("");
    expect(slide.style.width).toBe("");

    document.body.removeChild(root);
  });

  it("does not scale internal KaTeX svg nodes", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div class="content-html">
        <span class="katex">
          <span class="katex-html">
            <svg></svg>
          </span>
        </span>
      </div>
    `;
    document.body.appendChild(root);

    const content = root.querySelector(".content-html");
    const svg = root.querySelector("svg");

    defineLayoutMetric(content, "clientWidth", 200);
    defineLayoutMetric(svg, "scrollWidth", 500);
    defineLayoutMetric(svg, "scrollHeight", 60);
    defineRect(svg, 500, 60);

    const cleanup = applyAdaptiveLayout(root);

    expect(root.querySelector("[data-export-scale-wrapper='true']")).toBeNull();
    expect(svg.style.transform).toBe("");
    expect(svg.style.width).toBe("");
    expect(svg.parentElement.className).toBe("katex-html");

    cleanup();

    document.body.removeChild(root);
  });
});
