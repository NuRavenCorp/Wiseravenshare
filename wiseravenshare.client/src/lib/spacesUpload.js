import { apiClient } from "@/api/client";

const PUBLIC_FOLDERS = ["music", "video", "audio", "podcasts", "media", "live"];

export async function uploadToSpaces(file, folder = "uploads") {
  const usePublic = PUBLIC_FOLDERS.includes(folder);

  if (usePublic) {
    const { file_url } = await apiClient.integrations.Core.UploadPublicFile({ file });
    return { fileUrl: file_url, key: file_url };
  }

  const { file_uri } = await apiClient.integrations.Core.UploadPrivateFile({ file });
  return { fileUrl: file_uri, key: file_uri };
}