import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Check, ExternalLink } from "lucide-react";

export default function ConnectionDetailsForm({ platform }) {
  const [profile, setProfile] = useState(null);
  const [username, setUsername] = useState("");
  const [profileUrl, setProfileUrl] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const me = await apiClient.auth.me();
        const res = await apiClient.entities.UserProfile.filter(
          { created_by_id: me.id },
          { limit: 1 }
        );
        const existing = res.items?.[0] || null;
        setProfile(existing);
        if (existing) {
          const conn = (existing.social_connections || []).find(
            (c) => c.platform === platform
          );
          if (conn) {
            setUsername(conn.username || "");
            setProfileUrl(conn.profile_url || "");
            setDisplayName(conn.display_name || "");
          }
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [platform]);

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const me = await apiClient.auth.me();
      const newConn = {
        platform,
        username: username.trim(),
        profile_url: profileUrl.trim(),
        display_name: displayName.trim(),
      };

      if (!profile) {
        const created = await apiClient.entities.UserProfile.create({
          display_name: me.full_name || me.email || "Creator",
          social_connections: [newConn],
        });
        setProfile(created);
      } else {
        const conns = profile.social_connections || [];
        const idx = conns.findIndex((c) => c.platform === platform);
        const updatedConns =
          idx >= 0
            ? conns.map((c, i) => (i === idx ? newConn : c))
            : [...conns, newConn];
        await apiClient.entities.UserProfile.update(profile.id, {
          social_connections: updatedConns,
        });
        setProfile({ ...profile, social_connections: updatedConns });
      }
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-3">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-3 pt-3 border-t border-border">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        Connection Details
      </p>
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">
          Username / Handle
        </Label>
        <Input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder={`@your_${platform}_handle`}
        />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">
          Profile URL
        </Label>
        <Input
          value={profileUrl}
          onChange={(e) => setProfileUrl(e.target.value)}
          placeholder={`https://${platform}.com/your-profile`}
        />
      </div>
      <div>
        <Label className="text-xs text-muted-foreground mb-1 block">
          Display Name
        </Label>
        <Input
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="Name shown on that platform"
        />
      </div>
      <div className="flex items-center gap-2">
        <Button
          onClick={handleSave}
          disabled={saving}
          size="sm"
          className="flex-1"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : saved ? (
            <Check className="w-4 h-4" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saving ? "Saving..." : saved ? "Saved!" : "Save Details"}
        </Button>
        {profileUrl && (
          <a
            href={profileUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-2 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors"
            title="Open profile"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>
    </div>
  );
}