const ENGINE_REGISTRY = new Map();

function sourceTypeKey(sourceType) {
  return sourceType == null ? "" : String(sourceType).toLowerCase().trim();
}

export function registerEngine(definition) {
  const { engineId, label, description, supportedSourceTypes, parserFn } = definition || {};
  if (!engineId || typeof engineId !== "string") {
    throw new Error("registerEngine: engineId is required");
  }
  if (typeof parserFn !== "function") {
    throw new Error(`registerEngine: parserFn must be a function for engine "${engineId}"`);
  }
  const engines = (supportedSourceTypes || []).reduce((acc, st) => {
    const key = sourceTypeKey(st);
    if (key) {
      acc[key] = acc[key] || [];
      acc[key].push(engineId);
    }
    return acc;
  }, {});
  ENGINE_REGISTRY.set(engineId, { engineId, label, description, supportedSourceTypes, parserFn, engines });
}

export function getRegisteredEngines() {
  return Array.from(ENGINE_REGISTRY.values());
}

export function getEngine(engineId) {
  return ENGINE_REGISTRY.get(engineId) || null;
}

export function getAvailableEngineIds(sourceType) {
  const key = sourceTypeKey(sourceType);
  if (!key) return [];
  const result = [];
  for (const entry of ENGINE_REGISTRY.values()) {
    const mapped = entry.engines[key];
    if (mapped && mapped.length > 0) {
      result.push(entry.engineId);
    }
  }
  return result;
}

export function getAvailableEngines(sourceType) {
  const ids = getAvailableEngineIds(sourceType);
  return ids.map((id) => ENGINE_REGISTRY.get(id)).filter(Boolean);
}

export function getDefaultEngineId(sourceType) {
  const avail = getAvailableEngineIds(sourceType);
  if (avail.length === 0) return "legacy-js";
  if (avail.includes("legacy-js")) return "legacy-js";
  return avail[0];
}

export async function parseWithEngine(engineId, sourceType, file, context = {}) {
  const entry = ENGINE_REGISTRY.get(engineId);
  if (!entry) {
    throw new Error(`Engine "${engineId}" is not registered`);
  }
  return entry.parserFn(sourceType, file, context);
}

export function hasEngineSupport(sourceType) {
  return getAvailableEngineIds(sourceType).length > 0;
}
