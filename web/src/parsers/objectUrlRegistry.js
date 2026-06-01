const ownerToUrls = new Map();
const urlToOwner = new Map();

function getFileOwnerKey(file) {
  if (!file) {
    return "";
  }

  const name = String(file.name || "");
  const size = Number(file.size || 0);
  const lastModified = Number(file.lastModified || 0);
  const relativePath = String(file.webkitRelativePath || "");

  return `${name}::${size}::${lastModified}::${relativePath}`;
}

export function registerObjectURLForFile(file, objectURL) {
  const ownerKey = getFileOwnerKey(file);
  if (!ownerKey || !objectURL) {
    return objectURL;
  }

  const urls = ownerToUrls.get(ownerKey) || new Set();
  urls.add(objectURL);
  ownerToUrls.set(ownerKey, urls);
  urlToOwner.set(objectURL, ownerKey);
  return objectURL;
}

export function revokeObjectURL(objectURL) {
  if (!objectURL) {
    return;
  }

  const ownerKey = urlToOwner.get(objectURL);
  if (ownerKey) {
    const urls = ownerToUrls.get(ownerKey);
    if (urls) {
      urls.delete(objectURL);
      if (urls.size === 0) {
        ownerToUrls.delete(ownerKey);
      }
    }
    urlToOwner.delete(objectURL);
  }

  URL.revokeObjectURL(objectURL);
}

export function revokeObjectURLsForFile(file) {
  const ownerKey = getFileOwnerKey(file);
  if (!ownerKey) {
    return;
  }

  const urls = ownerToUrls.get(ownerKey);
  if (!urls) {
    return;
  }

  urls.forEach((objectURL) => {
    urlToOwner.delete(objectURL);
    URL.revokeObjectURL(objectURL);
  });

  ownerToUrls.delete(ownerKey);
}

export function revokeObjectURLsForFiles(files) {
  (Array.isArray(files) ? files : []).forEach((file) => {
    revokeObjectURLsForFile(file);
  });
}

export function revokeAllObjectURLs() {
  ownerToUrls.forEach((urls) => {
    urls.forEach((objectURL) => {
      URL.revokeObjectURL(objectURL);
    });
  });

  ownerToUrls.clear();
  urlToOwner.clear();
}

