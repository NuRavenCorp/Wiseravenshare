export type FinalTurn = {
  turnOrder: number;
  transcript: string;
  startMilliseconds?: number;
  endMilliseconds?: number;
};

function resolveAccessToken(accessToken?: string): string {
  if (accessToken && accessToken.trim()) return accessToken.trim();
  if (typeof window !== "undefined" && window.localStorage) {
    return (
      window.localStorage.getItem("wiseravenshare_access_token") ||
      window.localStorage.getItem("token") ||
      ""
    );
  }
  return "";
}

async function api<T>(
  path: string,
  accessToken?: string,
  init: RequestInit = {},
): Promise<T> {
  const token = resolveAccessToken(accessToken);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) || {}),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(path, {
    ...init,
    headers,
  });

  if (!response.ok) {
    const problem = await response.json().catch(() => null);
    throw new Error(problem?.message ?? problem?.title ?? `Request failed: ${response.status}`);
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export function createPerformance(songId: string, token?: string) {
  return api<{ id: string }>("/api/performances", token, {
    method: "POST",
    body: JSON.stringify({ songId }),
  });
}

export function saveTurns(
  performanceId: string,
  turns: FinalTurn[],
  token?: string,
) {
  return api<void>(`/api/performances/${performanceId}/turns`, token, {
    method: "PUT",
    body: JSON.stringify({ turns }),
  });
}

export function completePerformance(
  performanceId: string,
  token?: string,
) {
  return api<LyricScore>(
    `/api/performances/${performanceId}/complete`,
    token,
    { method: "POST" },
  );
}

export function getPerformance(performanceId: string, token?: string) {
  return api<Performance>(
    `/api/performances/${performanceId}`,
    token,
  );
}

export type LyricScore = {
  performanceId: string;
  score: number;
  matches: number;
  substitutions: number;
  missing: number;
  extras: number;
};

export type Performance = {
  id: string;
  songId: string;
  status: "Recording" | "Processing" | "Completed" | "Failed";
  startedAt: string;
  completedAt?: string;
  lyricScore?: number;
  matches?: number;
  substitutions?: number;
  missing?: number;
  extras?: number;
};
