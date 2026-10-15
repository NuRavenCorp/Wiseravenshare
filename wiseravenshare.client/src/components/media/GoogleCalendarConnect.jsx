import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { CalendarPlus, Loader2, Check } from "lucide-react";

const CONNECTOR_ID = "6acdb848e6d732b0ef836cad";

export default function GoogleCalendarConnect() {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const checkConnection = async () => {
    try {
      const res = await apiClient.functions.invoke("AddJamSessionToCalendar", { check_only: true });
      setConnected(!!res.data?.connected);
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    apiClient.auth.isAuthenticated().then((authed) => {
      if (authed) checkConnection();
      else setLoading(false);
    });
  }, []);

  const handleConnect = async () => {
    setBusy(true);
    try {
      const url = await apiClient.connectors.connectAppUser(CONNECTOR_ID);
      const popup = window.open(url, "_blank");
      const timer = setInterval(() => {
        if (!popup || popup.closed) {
          clearInterval(timer);
          checkConnection();
        }
      }, 500);
    } catch {
      /* ignore */
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnect = async () => {
    setBusy(true);
    try {
      await apiClient.connectors.disconnectAppUser(CONNECTOR_ID);
      setConnected(false);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return null;

  if (connected) {
    return (
      <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={busy} title="Click to disconnect your Google Calendar">
        <Check className="w-3.5 h-3.5 text-emerald-400" /> Calendar linked
      </Button>
    );
  }

  return (
    <Button variant="outline" size="sm" onClick={handleConnect} disabled={busy} title="Connect your Google Calendar so jam sessions are added automatically">
      {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CalendarPlus className="w-3.5 h-3.5" />}
      Connect Calendar
    </Button>
  );
}