import { useState } from "react";
import MNBridge from "../lib/mnBridge";
import useBridgeStore from "../store/useBridgeStore";

function normalizeBridgeError(error) {
  if (!error) {
    return { message: "Unknown bridge error" };
  }

  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack || "",
    };
  }

  if (typeof error === "object") {
    return {
      ...error,
      message: error.message || JSON.stringify(error),
    };
  }

  return {
    message: String(error),
  };
}

function BridgePage() {
  const [loading, setLoading] = useState(false);
  const logs = useBridgeStore((state) => state.logs);
  const appendLog = useBridgeStore((state) => state.appendLog);

  const callCommand = async (command) => {
    try {
      setLoading(true);
      const payload = {
        from: "web-template",
        timestamp: new Date().toISOString(),
      };
      const result = await MNBridge.send(command, payload);
      appendLog({
        type: "success",
        command,
        result,
      });
    } catch (error) {
      appendLog({
        type: "error",
        command,
        result: normalizeBridgeError(error),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel">
      <h2>BridgeDemo</h2>
      <p>Click the buttons below to call plugin commands. The responses will appear in the logs.</p>
      <div className="actions">
        <button disabled={loading} onClick={() => callCommand("ping")} type="button">
          Send ping
        </button>
        <button disabled={loading} onClick={() => callCommand("echo")} type="button">
          Send echo
        </button>
        <button disabled={loading} onClick={() => callCommand("closePanel")} type="button">
          Close panel
        </button>
      </div>
      <div className="logs">
        {logs.length === 0 ? <p>No bridge logs yet.</p> : null}
        {logs.map((item, idx) => (
          <pre key={`${item.command}-${idx}`}>
            {JSON.stringify(item, null, 2)}
          </pre>
        ))}
      </div>
    </section>
  );
}

export default BridgePage;
