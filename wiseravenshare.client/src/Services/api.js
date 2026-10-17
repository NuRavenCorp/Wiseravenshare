import { apiClient } from "@/api/client";

export const apiService = {
  async getInstrumentConnections() {
    const data = await apiClient.requestJson("/api/InstrumentConnections", { method: "GET" });
    return { data };
  },

  async uploadMusicTrack(file, fields = {}) {
    const data = await apiClient.ravensightMedia.uploadMusic(file, fields);
    return { data };
  },

  async recordStudioCaptureSource(payload) {
    const data = await apiClient.requestJson("/api/studio-capture/sources", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    return { data };
  },
};
