import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient } from "@/api/client";
import { useAuth } from "@/lib/AuthContext";
import { playChirp } from "@/lib/ravenChirp";
import { X } from "lucide-react";
import { Image } from "@/components/ui/image";

const CHIRP_IMG = "https://media.apiClient.com/images/public/6acad64c240f9153977f3360/a1cc56133_th1.jpg";

export default function RavenChirpToast() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [toasts, setToasts] = useState([]);
  const shownIds = useRef(new Set());

  useEffect(() => {
    if (!user) return;
    const unsub = apiClient.entities.Notification.subscribe((event) => {
      if (event.type !== "create") return;
      const n = event.data;
      if (!n || n.recipient_id !== user.id) return;
      if (shownIds.current.has(n.id)) return;
      shownIds.current.add(n.id);
      playChirp();
      const toast = { ...n, ts: Date.now() };
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.ts !== toast.ts));
      }, 5000);
    });
    return unsub;
  }, [user]);

  const dismiss = (ts) => setToasts((prev) => prev.filter((t) => t.ts !== ts));
  const handleClick = (t) => {
    dismiss(t.ts);
    if (t.link) navigate(t.link);
  };

  if (!user || toasts.length === 0) return null;

  return (
    <div className="fixed top-24 right-4 z-[100] flex flex-col gap-2 max-w-sm pointer-events-none">
      {toasts.map((t) => {
        return (
          <div
            key={t.ts}
            onClick={() => handleClick(t)}
            className="flex items-start gap-3 p-3 pr-2 rounded-lg border border-primary/40 bg-popover shadow-xl pointer-events-auto cursor-pointer hover:border-primary/70 transition-colors"
            style={{ animation: "slideIn 0.3s ease-out" }}
          >
            <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 border border-primary/30">
              <Image src={CHIRP_IMG} alt="RavenChirp" className="w-full h-full" fittingType="fill" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-accent mb-0.5 tracking-wide">RavenChirp</p>
              <p className="text-sm text-foreground">{t.message}</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); dismiss(t.ts); }}
              className="text-muted-foreground hover:text-foreground shrink-0 p-1"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}