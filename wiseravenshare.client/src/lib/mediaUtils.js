import { resolveApiUrl } from "@/api/client";

const protectedBlobUrlCache = new Map();
const PROTECTED_MEDIA_PATH_PREFIXES = [
  "/api/media/blob/",
  "/api/videostreaming/blob/",
  "/api/media/stream",
  "/api/videostreaming/stream",
];

const readAuthToken = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    return "";
  }

  return window.localStorage.getItem("wiseravenshare_access_token")
    || window.localStorage.getItem("token")
    || "";
};

const normalizeCandidateUrl = (raw) => {
  if (!raw) return "";
  if (raw.startsWith("/")) return resolveApiUrl(raw);
  if (raw.startsWith("api/")) return resolveApiUrl(`/${raw}`);
  return raw;
};

const isProtectedMediaPath = (pathName) => PROTECTED_MEDIA_PATH_PREFIXES.some((prefix) =>
  pathName.startsWith(prefix));

const fetchProtectedBlobUrl = async (absoluteUrl) => {
  if (protectedBlobUrlCache.has(absoluteUrl)) {
    return protectedBlobUrlCache.get(absoluteUrl);
  }

  const token = readAuthToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const response = await fetch(absoluteUrl, {
    method: "GET",
    credentials: "include",
    headers,
  });
  if (!response.ok) {
    throw new Error(`Media request failed (${response.status}).`);
  }

  const blob = await response.blob();
  if (!blob || blob.size <= 0) {
    throw new Error("Media request returned an empty payload.");
  }

  const objectUrl = URL.createObjectURL(blob);
  protectedBlobUrlCache.set(absoluteUrl, objectUrl);
  return objectUrl;
};

export async function getPlayableUrl(fileUri) {
  if (!fileUri) return null;
  if (fileUri.startsWith("blob:") || fileUri.startsWith("data:")) return fileUri;

  const candidateUrl = normalizeCandidateUrl(fileUri);
  if (!candidateUrl) return null;

  if (candidateUrl.startsWith("http")) {
    try {
      const absolute = new URL(candidateUrl);
      if (typeof window !== "undefined"
        && absolute.origin === window.location.origin
        && isProtectedMediaPath(absolute.pathname)) {
        return await fetchProtectedBlobUrl(absolute.toString());
      }
      return candidateUrl;
    } catch {
      return candidateUrl;
    }
  }

  if (candidateUrl.startsWith("/") && isProtectedMediaPath(candidateUrl)) {
    try {
      return await fetchProtectedBlobUrl(resolveApiUrl(candidateUrl));
    } catch {
      return resolveApiUrl(candidateUrl);
    }
  }

  return candidateUrl;
}