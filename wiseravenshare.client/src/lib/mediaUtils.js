import { resolveApiUrl } from "@/api/client";

export async function getPlayableUrl(fileUri) {
  if (!fileUri) return null;
  if (fileUri.startsWith("http")) return fileUri;
  if (fileUri.startsWith("blob:") || fileUri.startsWith("data:")) return fileUri;
  if (fileUri.startsWith("/")) return resolveApiUrl(fileUri);
  return fileUri;
}