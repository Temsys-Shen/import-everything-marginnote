export const ParseStatus = {
  PENDING: "pending",
  PROCESSING: "processing",
  SUCCESS: "success",
  ERROR: "error",
};

let docCounter = 0;

export function nextDocumentId() {
  docCounter += 1;
  return `doc-${Date.now()}-${docCounter}`;
}

export function createEmptyNormalizedDocument({ id, name, sourceType }) {
  return {
    id,
    name,
    sourceType,
    parseStatus: ParseStatus.PENDING,
    error: null,
    sections: [],
  };
}

export function toErrorShape(error) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack || "",
    };
  }

  if (error && typeof error === "object") {
    return {
      ...error,
      message: error.message || JSON.stringify(error),
    };
  }

  return {
    message: String(error),
  };
}

export function toSectionId(docId, sectionIndex) {
  return `${docId}-section-${sectionIndex + 1}`;
}
