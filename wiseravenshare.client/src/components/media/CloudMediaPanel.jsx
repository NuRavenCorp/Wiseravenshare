import React, { useState, useEffect } from "react";
import { apiClient } from "@/api/client";
import { getPlayableUrl } from "@/lib/mediaUtils";
import {
  Cloud,
  HardDriveDownload,
  Loader2,
  RefreshCw,
  FolderOpen,
  Music,
  Video,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import CloudBrowser from "@/components/media/CloudBrowser";

const PROVIDERS = {
  googledrive: { name: "Google Drive", connectorId: "6ace5a6f7a40e03b930459b0" },
  dropbox: { name: "Dropbox", connectorId: "6ace5b09fdf3a085bbb1915e" },
};

export default function CloudMediaPanel() {
  const [authed, setAuthed] = useState(false);
  const [connected, setConnected] = useState({ googledrive: false, dropbox: false });
  const [checking, setChecking] = useState(true);
  const [browser, setBrowser] = useState(null);
  const [assets, setAssets] = useState([]);
  const [loadingAssets, setLoadingAssets] = useState(true);
  const [assetError, setAssetError] = useState("");
  const [busy, setBusy] = useState({});
  const { toast } = useToast();

  const checkConnection = async (provider) => {
    try {
      await apiClient.functions.invoke("CloudMediaTransfer", { action: "list", provider, folderId: null });
      return true;
    } catch {
      return false;
    }
  };

  const refreshConnections = async () => {
    setChecking(true);
    const [g, d] = await Promise.all([checkConnection("googledrive"), checkConnection("dropbox")]);
    setConnected({ googledrive: g, dropbox: d });
    setChecking(false);
  };

  const fetchAssets = async () => {
    setLoadingAssets(true);
    try {
      const results = await Promise.allSettled([
        apiClient.ravensightMedia.listMusic(),
        apiClient.ravensightMedia.listVideos(),
        apiClient.ravensightMedia.listPhotos(100),
      ]);
      const unpack = (value) => Array.isArray(value) ? value : value?.items || value?.data || [];
      const [musicResult, videoResult, photoResult] = results;
      const music = musicResult.status === "fulfilled" ? unpack(musicResult.value) : [];
      const videos = videoResult.status === "fulfilled" ? unpack(videoResult.value) : [];
      const photos = photoResult.status === "fulfilled" ? unpack(photoResult.value) : [];
      const normalize = (asset, type, index) => ({
        ...asset,
        id: String(asset.id || asset.trackId || asset.videoId || asset.photoId || `${type}-${asset.fileName || asset.title || index}`),
        asset_type: type,
        title: asset.title || asset.name || asset.fileName || "Untitled",
        file_uri: asset.file_uri || asset.fileUrl || asset.mediaUrl || asset.videoUrl || asset.imageUrl || "",
        created_date: asset.created_date || asset.uploadedAt || asset.createdAt || asset.savedAtUtc || "",
      });
      setAssets([
        ...music.map((asset, index) => normalize(asset, "music", index)),
        ...videos.map((asset, index) => normalize(asset, "video", index)),
        ...photos.map((asset, index) => normalize(asset, "photo", index)),
      ].sort((a, b) => new Date(b.created_date || 0) - new Date(a.created_date || 0)));
      const failedTypes = results.flatMap((result, index) => result.status === "rejected" ? [ ["music", "video", "photo"][index] ] : []);
      setAssetError(failedTypes.length
        ? `Some media could not be loaded (${failedTypes.join(", ")}). Refresh to try again.`
        : "");
    } catch (error) {
      setAssets([]);
      setAssetError(error?.message || "Your media library could not be loaded.");
    } finally {
      setLoadingAssets(false);
    }
  };

  useEffect(() => {
    apiClient.auth.isAuthenticated().then(async (a) => {
      setAuthed(a);
      if (a) {
        await refreshConnections();
        await fetchAssets();
      } else {
        setChecking(false);
      }
    });
  }, []);

  const handleConnect = async (provider) => {
    try {
      const url = await apiClient.connectors.connectAppUser(PROVIDERS[provider].connectorId);
      const popup = window.open(url, "_blank");
      const timer = setInterval(() => {
        if (!popup || popup.closed) {
          clearInterval(timer);
          refreshConnections();
        }
      }, 500);
    } catch (e) {
      toast({ title: "Could not start connection", description: e?.message, variant: "destructive" });
    }
  };

  const handleDisconnect = async (provider) => {
    try {
      await apiClient.connectors.disconnectAppUser(PROVIDERS[provider].connectorId);
      setConnected((c) => ({ ...c, [provider]: false }));
    } catch (e) {
      toast({ title: "Disconnect failed", description: e?.message, variant: "destructive" });
    }
  };

  const exportAsset = async (provider, asset) => {
    const key = `export-${provider}-${asset.id}`;
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      await apiClient.functions.invoke("CloudMediaTransfer", {
        action: "export",
        provider,
        assetId: asset.id,
      });
      toast({ title: `Saved to ${PROVIDERS[provider].name}`, description: asset.title });
    } catch (e) {
      toast({ title: "Export failed", description: e?.message, variant: "destructive" });
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  };

  const downloadAsset = async (asset) => {
    const key = `dl-${asset.id}`;
    setBusy((b) => ({ ...b, [key]: true }));
    try {
      const url = await getPlayableUrl(asset.file_uri);
      const a = document.createElement("a");
      a.href = url;
      a.download = asset.title || "media";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      toast({ title: "Download failed", description: e?.message, variant: "destructive" });
    } finally {
      setBusy((b) => ({ ...b, [key]: false }));
    }
  };

  if (!authed) {
    return (
      <div className="rounded-lg border border-border bg-card p-8 text-center">
        <Cloud aria-hidden="true" className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
        <p className="text-sm text-muted-foreground mb-4">
          Sign in to connect your cloud storage and transfer media.
        </p>
        <Button onClick={() => apiClient.auth.redirectToLogin()}>Sign in</Button>
      </div>
    );
  }

  const iconFor = (t) =>
    t === "video" ? <Video className="w-4 h-4" /> : t === "music" ? <Music className="w-4 h-4" /> : <ImageIcon className="w-4 h-4" />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-heading text-xl text-foreground mb-1">Cloud &amp; Device Transfer</h2>
        <p className="text-sm text-muted-foreground">
          Import from your cloud accounts, export library media back to them, or download to your device (SD card).
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {Object.entries(PROVIDERS).map(([key, p]) => (
          <div key={key} className="rounded-lg border border-border bg-card p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">{p.name}</p>
              <p className="text-xs text-muted-foreground">
                {connected[key] ? "Connected" : checking ? "Checking…" : "Not connected"}
              </p>
            </div>
            {connected[key] ? (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setBrowser(key)}>
                  <FolderOpen aria-hidden="true" className="w-4 h-4" /> Browse
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleDisconnect(key)}>
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button size="sm" onClick={() => handleConnect(key)} disabled={checking}>
                Connect
              </Button>
            )}
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-foreground">Your library</p>
          <Button size="sm" variant="ghost" onClick={fetchAssets} disabled={loadingAssets} aria-label="Refresh media library">
            <RefreshCw aria-hidden="true" className="w-4 h-4" />
          </Button>
        </div>
        {assetError && <p role="status" className="mb-3 text-sm text-destructive">{assetError}</p>}
        {loadingAssets ? (
          <div className="flex justify-center py-6">
            <Loader2 aria-hidden="true" className="w-5 h-5 animate-spin text-primary" />
          </div>
        ) : assets.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No media in your library yet.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {assets.map((a) => (
              <div key={a.id} className="flex items-center gap-3 p-2 rounded border border-border bg-secondary/30">
                <span className="text-primary" aria-hidden="true">{iconFor(a.asset_type)}</span>
                <span className="flex-1 text-sm text-foreground truncate">{a.title || "Untitled"}</span>
                <div className="flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy[`export-googledrive-${a.id}`]}
                    onClick={() => exportAsset("googledrive", a)}
                    title="Save to Google Drive"
                  >
                    {busy[`export-googledrive-${a.id}`] ? (
                      <Loader2 aria-hidden="true" className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Cloud aria-hidden="true" className="w-3.5 h-3.5" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy[`export-dropbox-${a.id}`]}
                    onClick={() => exportAsset("dropbox", a)}
                    title="Save to Dropbox"
                  >
                    {busy[`export-dropbox-${a.id}`] ? (
                      <Loader2 aria-hidden="true" className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Cloud aria-hidden="true" className="w-3.5 h-3.5" />
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy[`dl-${a.id}`]}
                    onClick={() => downloadAsset(a)}
                    title="Download to device / SD card"
                  >
                    {busy[`dl-${a.id}`] ? (
                      <Loader2 aria-hidden="true" className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <HardDriveDownload aria-hidden="true" className="w-3.5 h-3.5" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {browser && (
        <CloudBrowser provider={browser} onClose={() => setBrowser(null)} onImported={fetchAssets} />
      )}
    </div>
  );
}
