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

const buildBlobProxyPath = (objectKey) => {
  const normalized = String(objectKey || "").trim().replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized) return "";
  const encodedPath = normalized
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return encodedPath ? `/api/media/blob/${encodedPath}` : "";
};

const tryExtractSpacesObjectKey = (absoluteUrl) => {
  if (!absoluteUrl || !absoluteUrl.hostname) return "";
  if (!absoluteUrl.hostname.toLowerCase().includes("digitaloceanspaces.com")) return "";

  const parts = absoluteUrl.pathname
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean);

  if (parts.length < 2) return "";
  return parts.slice(1).join("/");
};

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

const fetchPythonRenderedBlobUrl = async (sourceUri) => {
  const sourceValue = String(sourceUri || "").trim();
  if (!sourceValue) {
    throw new Error("Missing source for python renderer.");
  }
  if (sourceValue.includes("/api/python-matrix/media/render")) {
    throw new Error("Nested python renderer fallback is not allowed.");
  }

  const token = readAuthToken();
  const headers = token ? { Authorization: `Bearer ${token}` } : {};
  const rendererUrl = resolveApiUrl(`/api/python-matrix/media/render?source=${encodeURIComponent(sourceValue)}`);
  const response = await fetch(rendererUrl, {
    method: "GET",
    credentials: "include",
    headers,
  });
  if (!response.ok) {
    throw new Error(`Python renderer request failed (${response.status}).`);
  }

  const blob = await response.blob();
  if (!blob || blob.size <= 0) {
    throw new Error("Python renderer returned an empty payload.");
  }

  const objectUrl = URL.createObjectURL(blob);
  protectedBlobUrlCache.set(sourceValue, objectUrl);
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
        try {
          return await fetchProtectedBlobUrl(absolute.toString());
        } catch {
          return await fetchPythonRenderedBlobUrl(absolute.toString());
        }
      }

      const spacesObjectKey = tryExtractSpacesObjectKey(absolute);
      if (spacesObjectKey) {
        const blobProxyPath = buildBlobProxyPath(spacesObjectKey);
        if (blobProxyPath) {
          try {
            return await fetchProtectedBlobUrl(resolveApiUrl(blobProxyPath));
          } catch {
            return await fetchPythonRenderedBlobUrl(absolute.toString());
          }
        }
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
      try {
        return await fetchPythonRenderedBlobUrl(resolveApiUrl(candidateUrl));
      } catch {
        return resolveApiUrl(candidateUrl);
      }
    }
  }

  return candidateUrl;
}