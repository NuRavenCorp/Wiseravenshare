import React, { useState, useEffect, useRef } from "react";
import { apiClient } from "@/api/client";
import {
  Loader2,
  Mic,
  ChevronLeft,
  FileText,
  ListChecks,
  Headphones,
  Lock,
  DollarSign,
  CheckCircle,
  Users,
  Radio,
  GitBranch,
  Film,
} from "lucide-react";
import PodcastLaunchWizard from "@/components/podcasts/PodcastLaunchWizard";
import PodcastForm from "@/components/podcasts/PodcastForm";
import PodcastScriptEditor from "@/components/podcasts/PodcastScriptEditor";
import PodcastItinerary from "@/components/podcasts/PodcastItinerary";
import PodcastPlayer from "@/components/podcasts/PodcastPlayer";
import PodcastMonetization from "@/components/podcasts/PodcastMonetization";
import PodcastTeamPanel from "@/components/podcasts/PodcastTeamPanel";
import ProductionTimeline from "@/components/podcasts/ProductionTimeline";
import PodcastMediaTab from "@/components/podcasts/PodcastMediaTab";
import RecordingSession from "@/components/ravensight/RecordingSession";
import PodcastCrewJoinBanner from "@/components/podcasts/PodcastCrewJoinBanner";
import { resolvePermissions } from "@/lib/podcastPermissions";

const LAST_PODCAST_KEY = "wrs_podcast_last_selected";
const LAST_TAB_KEY = "wrs_podcast_last_tab";

function readLastSelected() {
  try { return localStorage.getItem(LAST_PODCAST_KEY) || null; } catch { return null; }
}
function writeLastSelected(id) {
  try { id ? localStorage.setItem(LAST_PODCAST_KEY, id) : localStorage.removeItem(LAST_PODCAST_KEY); } catch {}
}
function readLastTab() {
  try { return localStorage.getItem(LAST_TAB_KEY) || "script"; } catch { return "script"; }
}
function writeLastTab(tab) {
  try { localStorage.setItem(LAST_TAB_KEY, tab); } catch {}
}

export default function PodcastsPanel() {
  const [podcasts, setPodcasts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [tab, setTab] = useState("script");
  const [showForm, setShowForm] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [user, setUser] = useState(null);
  const [payments, setPayments] = useState([]);
  const [teams, setTeams] = useState([]);
  const [paymentMsg, setPaymentMsg] = useState("");
  const viewedRef = useRef(null);

  // Persist navigation state so it survives login/logout
  const selectEpisode = (id, tabName) => {
    const nextTab = tabName || "script";
    setSelectedId(id);
    setTab(nextTab);
    writeLastSelected(id);
    writeLastTab(nextTab);
  };
  const changeTab = (tabName) => {
    setTab(tabName);
    writeLastTab(tabName);
  };
  const clearSelection = () => {
    setSelectedId(null);
    writeLastSelected(null);
  };

  const load = async () => {
    try {
      const page = await apiClient.entities.Podcast.filter(
        {},
        { sort: "-episode_number", limit: 50 }
      );
      const items = page.items || [];
      setPodcasts(items);

      // Restore last-viewed episode if it still exists in the list
      const lastId = readLastSelected();
      if (lastId && items.some((p) => p.id === lastId)) {
        setSelectedId(lastId);
        setTab(readLastTab());
      }
    } finally {
      setLoading(false);
    }
  };

  const loadUserData = async () => {
    try {
      const me = await apiClient.auth.me();
      if (me) {
        setUser(me);
        const [payPage, teamPage] = await Promise.all([
          apiClient.entities.PodcastPayment.filter({
            user_id: me.id,
            status: { $in: ["completed", "active"] },
          }),
          apiClient.entities.Team.filter({}),
        ]);
        setPayments(payPage.items || []);
        setTeams(teamPage.items || []);
      }
    } catch {
      // not logged in
    }
  };

  useEffect(() => {
    load();
    loadUserData();
    const urlParams = new URLSearchParams(window.location.search);
    const payment = urlParams.get("payment");
    if (payment === "success") {
      setPaymentMsg("Payment successful! You now have access.");
      setTimeout(() => {
        loadUserData();
        setPaymentMsg("");
      }, 4000);
    } else if (payment === "cancelled") {
      setPaymentMsg("Payment was cancelled.");
      setTimeout(() => setPaymentMsg(""), 4000);
    }
  }, []);

  const handleCreate = async (data) => {
    await apiClient.entities.Podcast.create(data);
    setShowForm(false);
    load();
  };

  const handleLaunchComplete = (pod) => {
    setLaunching(false);
    setShowForm(false);
    load();
    selectEpisode(pod.id, "script");
  };

  const selected = podcasts.find((p) => p.id === selectedId);

  const isOwner = selected?.created_by_id === user?.id;
  const permissions = selected ? resolvePermissions(selected, teams, user?.id) : null;

  const hasAccess = (podcast) => {
    if (user?.isAdmin || user?.adminPassActive || user?.accessScope === "admin") return true;
    if (!podcast.is_premium) return true;
    if (podcast.created_by_id === user?.id) return true;
    if (payments.some((p) => p.podcast_id === podcast.id)) return true;
    if (teams.some((t) => podcast.team_ids?.includes(t.id))) return true;
    return false;
  };

  const isTeamMember = (podcast) =>
    teams.some((t) => podcast.team_ids?.includes(t.id));

  useEffect(() => {
    if (
      selected &&
      hasAccess(selected) &&
      viewedRef.current !== selected.id
    ) {
      viewedRef.current = selected.id;
      apiClient.functions
        .invoke("TrackPodcastView", { podcast_id: selected.id })
        .catch(() => {});
    }
  }, [selected, payments, teams]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <>
      {paymentMsg && (
        <div className="mb-6 flex items-center gap-2 p-4 rounded-lg border border-primary/30 bg-primary/5">
          <CheckCircle className="w-5 h-5 text-primary" />
          <p className="text-sm text-foreground">{paymentMsg}</p>
        </div>
      )}

      {selected ? (
        <div className="space-y-6">
          <button
            onClick={() => clearSelection()}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronLeft className="w-4 h-4" /> All Episodes
          </button>

          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 text-xs text-accent mb-1">
                <Mic className="w-3.5 h-3.5" /> Episode{" "}
                {selected.episode_number}
                {selected.is_premium && (
                  <span className="flex items-center gap-1 text-primary ml-2">
                    <DollarSign className="w-3 h-3" /> Premium
                  </span>
                )}
              </div>
              <h1 className="font-heading text-3xl text-foreground">
                {selected.title}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {selected.subject_matter}
              </p>
            </div>
            {hasAccess(selected) && (
              <button
                onClick={() => changeTab("record")}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
              >
                <Radio className="w-4 h-4" /> Start Episode
              </button>
            )}
          </div>

          <PodcastPlayer
            podcast={selected}
            hasAccess={hasAccess(selected)}
            isTeamMember={isTeamMember(selected)}
          />

          {hasAccess(selected) && (
            <>
              <div className="flex gap-1 border-b border-border">
                <button
                  onClick={() => changeTab("script")}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition-colors ${
                    tab === "script"
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <FileText className="w-4 h-4" /> Script
                </button>
                <button
                  onClick={() => changeTab("itinerary")}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition-colors ${
                    tab === "itinerary"
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <ListChecks className="w-4 h-4" /> Line-up
                  </button>
                  <button
                  onClick={() => changeTab("timeline")}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition-colors ${
                    tab === "timeline"
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                  >
                  <GitBranch className="w-4 h-4" /> Timeline
                  </button>
                  <button
                  onClick={() => changeTab("record")}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition-colors ${
                    tab === "record"
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                  >
                  <Radio className="w-4 h-4" /> Record
                  </button>
                  <button
                  onClick={() => changeTab("media")}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition-colors ${
                    tab === "media"
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                  >
                  <Film className="w-4 h-4" /> Media
                  </button>
                {isOwner && (
                  <button
                    onClick={() => changeTab("monetization")}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition-colors ${
                      tab === "monetization"
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <DollarSign className="w-4 h-4" /> Monetization
                  </button>
                )}
                {(isOwner || isTeamMember(selected)) && (
                  <button
                    onClick={() => changeTab("team")}
                    className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 transition-colors ${
                      tab === "team"
                        ? "border-primary text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Users className="w-4 h-4" /> Team
                  </button>
                )}
              </div>

              {tab === "script" && (
                <PodcastScriptEditor podcast={selected} onUpdate={load} permissions={permissions} />
              )}
              {tab === "itinerary" && (
                <PodcastItinerary podcast={selected} onUpdate={load} permissions={permissions} />
              )}
              {tab === "timeline" && (
                <ProductionTimeline podcast={selected} onUpdate={load} />
              )}
              {tab === "record" && (
                <RecordingSession podcast={selected} onUpdate={load} />
              )}
              {tab === "media" && (
                <PodcastMediaTab podcast={selected} onUpdate={load} />
              )}
              {tab === "monetization" && isOwner && (
                <PodcastMonetization podcast={selected} onUpdate={load} />
              )}
              {tab === "team" && (isOwner || isTeamMember(selected)) && (
                <PodcastTeamPanel podcast={selected} onUpdate={load} />
              )}
            </>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-heading text-2xl text-foreground flex items-center gap-2">
                <Headphones className="w-6 h-6 text-primary" /> Podcasts
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Write scripts, plan your line-up, and approve episodes.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => { setShowForm(false); setLaunching(true); }}
                className="text-sm text-primary hover:text-primary/80 transition-colors font-medium"
              >
                + Launch New Episode
              </button>
              <button
                onClick={() => { setLaunching(false); setShowForm(!showForm); }}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {showForm ? "Cancel" : "Quick Create"}
              </button>
            </div>
          </div>

          {launching && (
            <div className="p-5 rounded-xl border border-border bg-card">
              <PodcastLaunchWizard onComplete={handleLaunchComplete} onCancel={() => setLaunching(false)} />
            </div>
          )}

          {showForm && !launching && (
            <div className="p-5 rounded-xl border border-border bg-card">
              <PodcastForm onCreate={handleCreate} />
            </div>
          )}

          {/* Crew join banner — shows cards for episodes this user is invited to as crew */}
          {user && !launching && !showForm && (
            <PodcastCrewJoinBanner userId={user.id} onUpdate={load} />
          )}

          {podcasts.length === 0 && !showForm ? (
            <div className="text-center py-20">
              <Mic className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">
                No episodes yet. Start your first podcast.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {podcasts.map((p) => {
                const locked = p.is_premium && !hasAccess(p);
                return (
                  <button
                    key={p.id}
                    onClick={() => selectEpisode(p.id, "script")}
                    className="text-left p-5 rounded-xl border border-border bg-card hover:border-primary/40 transition-colors group"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <span className="text-xs text-accent">
                        EP {p.episode_number}
                      </span>
                      <div className="flex items-center gap-1.5">
                        {p.is_premium && (
                          <span className="flex items-center gap-0.5 text-xs text-primary">
                            <DollarSign className="w-3 h-3" />
                          </span>
                        )}
                        {locked && (
                          <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full capitalize ${
                            p.status === "published"
                              ? "bg-green-500/15 text-green-500"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {p.status}
                        </span>
                      </div>
                    </div>
                    <h3 className="font-heading text-lg text-foreground group-hover:text-primary transition-colors">
                      {p.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                      {locked && p.teaser_text
                        ? p.teaser_text
                        : p.subject_matter}
                    </p>
                    <div className="flex items-center gap-3 mt-3 text-xs text-muted-foreground">
                      {locked ? (
                        <span className="flex items-center gap-1 text-primary">
                          <Lock className="w-3 h-3" /> Premium content
                        </span>
                      ) : (
                        <>
                          <span
                            className={`flex items-center gap-1 capitalize ${
                              p.script_status === "approved"
                                ? "text-green-500"
                                : ""
                            }`}
                          >
                            <FileText className="w-3 h-3" />{" "}
                            {p.script_status || "draft"}
                          </span>
                          <span
                            className={`flex items-center gap-1 capitalize ${
                              p.lineup_status === "approved"
                                ? "text-green-500"
                                : ""
                            }`}
                          >
                            <ListChecks className="w-3 h-3" />{" "}
                            {p.lineup_status || "pending"}
                          </span>
                        </>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}