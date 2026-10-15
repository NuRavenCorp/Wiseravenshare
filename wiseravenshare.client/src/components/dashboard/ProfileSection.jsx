import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Loader2, Save, Check } from "lucide-react";

export default function ProfileSection() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await apiClient.entities.UserProfile.filter({ created_by_id: user.id }, { limit: 1 });
        const items = res.items || [];
        if (items.length > 0) {
          setProfile(items[0]);
        } else {
          const np = await apiClient.entities.UserProfile.create({
            display_name: user.full_name || user.email?.split("@")[0] || "Creator",
          });
          setProfile(np);
        }
      } finally {
        setLoading(false);
      }
    };
    if (user) load();
  }, [user]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const updated = await apiClient.entities.UserProfile.update(profile.id, {
        display_name: profile.display_name,
        bio: profile.bio,
        location: profile.location,
        website: profile.website,
        avatar_uri: profile.avatar_uri,
      });
      setProfile(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>;
  if (!profile) return <p className="text-muted-foreground">Could not load profile.</p>;

  return (
    <div className="rounded-lg border border-border bg-card p-6 space-y-4 max-w-2xl">
      <div className="space-y-2">
        <Label htmlFor="display_name">Display Name</Label>
        <Input id="display_name" value={profile.display_name || ""} onChange={(e) => setProfile({ ...profile, display_name: e.target.value })} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="bio">Bio</Label>
        <Textarea id="bio" value={profile.bio || ""} onChange={(e) => setProfile({ ...profile, bio: e.target.value })} rows={4} placeholder="Tell the flock about yourself..." />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="location">Location</Label>
          <Input id="location" value={profile.location || ""} onChange={(e) => setProfile({ ...profile, location: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="website">Website</Label>
          <Input id="website" value={profile.website || ""} onChange={(e) => setProfile({ ...profile, website: e.target.value })} placeholder="https://..." />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="avatar">Avatar URL</Label>
        <Input id="avatar" value={profile.avatar_uri || ""} onChange={(e) => setProfile({ ...profile, avatar_uri: e.target.value })} placeholder="https://..." />
      </div>
      <Button onClick={handleSave} disabled={saving}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
        {saved ? "Saved!" : "Save Profile"}
      </Button>
    </div>
  );
}