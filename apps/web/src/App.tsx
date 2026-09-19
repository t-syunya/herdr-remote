import { useEffect, useState } from "react";

import { api } from "./api";

type ConnectionStatus = "checking" | "connected" | "unavailable";

export function App() {
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("checking");

  useEffect(() => {
    void api.api.health.$get().then(
      (response) => {
        setConnectionStatus(response.ok ? "connected" : "unavailable");
      },
      () => {
        setConnectionStatus("unavailable");
      },
    );
  }, []);

  return (
    <main>
      <h1>Herdr Remote</h1>
      <p aria-live="polite">
        Server: {connectionStatus === "checking" ? "確認中" : null}
        {connectionStatus === "connected" ? "接続済み" : null}
        {connectionStatus === "unavailable" ? "接続できません" : null}
      </p>
    </main>
  );
}
