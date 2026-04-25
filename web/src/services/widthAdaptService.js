const TARGET_SELECTOR = [
  "table",
  "pre",
  ".pptx-slide-shell",
  ".mn-import-docx-wrapper",
  "section.mn-import-docx",
  "svg",
  "img",
].join(", ");

function restoreScaledNodes(rootElement) {
  rootElement.querySelectorAll("[data-export-scale-wrapper='true']").forEach((wrapper) => {
    const target = wrapper.firstElementChild;
    if (!target) {
      if (wrapper.parentNode) {
        wrapper.parentNode.removeChild(wrapper);
      }
      return;
    }

    target.style.transform = "";
    target.style.transformOrigin = "";
    target.style.width = target.dataset.originalWidth || "";
    target.style.maxWidth = target.dataset.originalMaxWidth || "";
    delete target.dataset.originalWidth;
    delete target.dataset.originalMaxWidth;
    if (wrapper.parentNode) {
      wrapper.parentNode.insertBefore(target, wrapper);
      wrapper.parentNode.removeChild(wrapper);
    }
  });
}

function measureWidth(element) {
  return Math.max(
    element.scrollWidth || 0,
    element.getBoundingClientRect().width || 0,
  );
}

function measureHeight(element) {
  return Math.max(
    element.scrollHeight || 0,
    element.getBoundingClientRect().height || 0,
  );
}

export function applyAdaptiveLayout(rootElement, options = {}) {
  if (!rootElement) {
    return () => {};
  }

  const {
    onMeasureError,
  } = options;

  restoreScaledNodes(rootElement);

  const targets = rootElement.querySelectorAll(TARGET_SELECTOR);
  targets.forEach((element) => {
    try {
      if (element.closest("[data-export-scale-wrapper='true']")) {
        return;
      }

      const parent = element.parentElement;
      if (!parent) {
        return;
      }

      const availableWidth = Math.max(0, parent.clientWidth - 2);
      if (availableWidth <= 0) {
        return;
      }

      const naturalWidth = measureWidth(element);
      if (naturalWidth <= availableWidth + 1) {
        return;
      }

      const naturalHeight = measureHeight(element);
      const scale = availableWidth / naturalWidth;
      if (!(scale > 0 && scale < 1)) {
        return;
      }

      const wrapper = document.createElement("div");
      wrapper.dataset.exportScaleWrapper = "true";
      wrapper.className = "overflow-scale-wrapper";
      wrapper.style.width = `${availableWidth}px`;
      wrapper.style.height = `${Math.max(1, naturalHeight * scale)}px`;

      element.dataset.originalWidth = element.style.width || "";
      element.dataset.originalMaxWidth = element.style.maxWidth || "";
      element.style.width = `${naturalWidth}px`;
      element.style.maxWidth = "none";
      element.style.transformOrigin = "top left";
      element.style.transform = `scale(${scale})`;

      parent.insertBefore(wrapper, element);
      wrapper.appendChild(element);
    } catch (error) {
      if (typeof onMeasureError === "function") {
        onMeasureError({
          selector: element && element.tagName ? element.tagName.toLowerCase() : "unknown",
          message: error && error.message ? error.message : String(error),
        });
      }
    }
  });

  return function cleanupAdaptiveLayout() {
    restoreScaledNodes(rootElement);
  };
}
