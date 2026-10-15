import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { Bluetooth, Wifi, Usb, Copy, Check, Users, Loader2, Link as LinkIcon } from "lucide-react";
import { useWebRTCHost } from "@/hooks/useWebRTCHost";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

const METHOD_LABELS = { bt: "Bluetooth", wifi: "WiFi", wired: "Wired" };

export default function TeamConnections() {
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState({});
  const [sessionCode, setSessionCode] = useState(null);
  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const { peers: rtcPeers, streams, connected: rtcConnected } = useWebRTCHost(sessionCode);
  const { toast } = useToast();

  const fetchTeams = async () => {
    try {
      const res = await apiClient.entities.Team.filter({}, { sort: "-created_date", limit: 50 });
      setTeams(res.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeams();
  }, []);

  const members = teams.flatMap((t) =>
    (t.member_details || []).map((m) => ({ ...m, team_name: t.team_name }))
  );

  const memberKey = (m) => m.user_id || m.display_name;

  const connectBT = async (member) => {
    if (!navigator.bluetooth) {
      toast({
        title: "Bluetooth not supported",
        description: "Use Chrome or Edge on desktop/Android.",
        variant: "destructive",
      });
      return;
    }
    try {
      const device = await navigator.bluetooth.requestDevice({ acceptAllDevices: true });
      setConnected((prev) => ({ ...prev, [memberKey(member)]: "bt" }));
      toast({ title: `Connected to ${device.name || "device"} via Bluetooth` });
    } catch (e) {
      if (e.name !== "NotFoundError")
        toast({ title: "Bluetooth connection failed", variant: "destructive" });
    }
  };

  const connectWiFi = (member) => {
    if (!sessionCode) {
      setSessionCode(Math.random().toString(36).substring(2, 8).toUpperCase());
    }
    setConnected((prev) => ({ ...prev, [memberKey(member)]: "wifi" }));
    toast({ title: `Connected to ${member.display_name || "team member"} via WiFi` });
  };

  const connectWired = async (member) => {
    if (!navigator.usb) {
      toast({
        title: "USB not supported",
        description: "Use Chrome or Edge on desktop.",
        variant: "destructive",
      });
      return;
    }
    try {
      const device = await navigator.usb.requestDevice({ filters: [] });
      setConnected((prev) => ({ ...prev, [memberKey(member)]: "wired" }));
      toast({ title: `Connected to ${device.productName || "USB device"}` });
    } catch (e) {
      if (e.name !== "NotFoundError")
        toast({ title: "USB connection failed", variant: "destructive" });
    }
  };

  const disconnect = (member) => {
    setConnected((prev) => {
      const next = { ...prev };
      delete next[memberKey(member)];
      return next;
    });
  };

  const copyJoinLink = () => {
    if (sessionCode) {
      const link = `${window.location.origin}/join-feed?code=${sessionCode}`;
      navigator.clipboard.writeText(link);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }
  };

  const copyCode = () => {
    if (sessionCode) {
      navigator.clipboard.writeText(sessionCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  if (teams.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-card p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-medium text-foreground">Team Connections</h3>
          <span className="text-xs text-muted-foreground">
            ({Object.keys(connected).length} connected)
          </span>
        </div>
        {sessionCode && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Session:</span>
            <code className="px-2 py-0.5 rounded bg-secondary text-primary font-mono text-sm">
              {sessionCode}
            </code>
            <button
              onClick={copyCode}
              className="text-muted-foreground hover:text-foreground"
              title="Copy session code"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              onClick={copyJoinLink}
              className="text-muted-foreground hover:text-foreground"
              title="Copy join link"
            >
              {linkCopied ? (
                <Check className="w-3.5 h-3.5 text-green-500" />
              ) : (
                <LinkIcon className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        )}
        {sessionCode && (
          <p className="text-xs text-muted-foreground mt-1">
            Share the link or code with team members. They open it on their device to share their camera.
          </p>
        )}
      </div>

      {members.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No team members found. Add members to your team to connect their devices as camera feeds.
        </p>
      ) : (
        <div className="space-y-2">
          {members.map((m, i) => {
            const key = memberKey(m);
            const method = connected[key];
            return (
              <div
                key={i}
                className="flex items-center justify-between gap-2 py-1.5 border-b border-border last:border-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center shrink-0">
                    <span className="text-xs text-foreground">
                      {(m.display_name || "?").charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm text-foreground truncate">
                      {m.display_name || "Unknown"}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {m.role || m.responsibility || m.device || ""}
                    </p>
                  </div>
                </div>
                {method ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="inline-flex items-center gap-1 text-xs text-green-500">
                      <Check className="w-3 h-3" /> {METHOD_LABELS[method]}
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => disconnect(m)}>
                      Disconnect
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => connectBT(m)}
                      title="Connect via Bluetooth"
                    >
                      <Bluetooth className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => connectWiFi(m)}
                      title="Connect via WiFi (same router)"
                    >
                      <Wifi className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => connectWired(m)}
                      title="Connect via USB cable"
                    >
                      <Usb className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}