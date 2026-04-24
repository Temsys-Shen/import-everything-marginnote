const BRIDGE_SCHEME = "mnaddon://bridge?payload=";

function nextRequestId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function ensureBridgeReceiver() {
  if (typeof window.__MNBridgePending !== "object") {
    window.__MNBridgePending = {};
  }

  if (typeof window.__MNBridgeReceive_MNImportEverythingAddon === "function") {
    return;
  }

  window.__MNBridgeReceive_MNImportEverythingAddon = (raw) => {
    const response = JSON.parse(raw);
    const pending = window.__MNBridgePending[response.requestId];
    if (!pending) {
      return;
    }

    delete window.__MNBridgePending[response.requestId];

    if (response.error) {
      pending.reject(response.error);
      return;
    }

    pending.resolve(response.payload);
  };
}

function send(command, payload = null) {
  ensureBridgeReceiver();

  const requestId = nextRequestId();
  const message = {
    command,
    requestId,
    payload,
    error: null,
  };

  return new Promise((resolve, reject) => {
    window.__MNBridgePending[requestId] = {
      resolve(result) {
        resolve(result);
      },
      reject(error) {
        reject(error);
      },
    };

    const encoded = encodeURIComponent(JSON.stringify(message));
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = `${BRIDGE_SCHEME}${encoded}`;
    document.body.appendChild(iframe);
    setTimeout(() => {
      try {
        iframe.remove();
      } catch (error) {
        // no-op
      }
    }, 600);
  });
}

const MNBridge = {
  send,
};

export default MNBridge;
