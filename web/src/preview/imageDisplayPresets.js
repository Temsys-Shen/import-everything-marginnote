export const DEFAULT_IMAGE_DISPLAY_PRESET_ID = "fit-width";

export const IMAGE_DISPLAY_PRESETS = [
  {
    id: "fit-width",
    label: "适应宽度",
    description: "图片不超过正文宽度，适合大图和截图。",
  },
  {
    id: "large",
    label: "大图",
    description: "最多720px，保留较多细节。",
  },
  {
    id: "medium",
    label: "中图",
    description: "最多520px，正文阅读更均衡。",
  },
  {
    id: "small",
    label: "小图",
    description: "最多360px，适合图标和辅助插图。",
  },
];

export function normalizeImageDisplayPresetId(presetId) {
  return IMAGE_DISPLAY_PRESETS.some((preset) => preset.id === presetId)
    ? presetId
    : DEFAULT_IMAGE_DISPLAY_PRESET_ID;
}

export function getImageDisplayPreset(presetId) {
  const normalizedId = normalizeImageDisplayPresetId(presetId);
  return IMAGE_DISPLAY_PRESETS.find((preset) => preset.id === normalizedId);
}
