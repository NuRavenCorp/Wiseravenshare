import { apiClient } from "@/api/client";

const query = (params) => {
  const searchParams = new URLSearchParams();
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") {
      searchParams.set(key, String(value));
    }
  });
  const serialized = searchParams.toString();
  return serialized ? `?${serialized}` : "";
};

export const fmService = {
  async getMyCreatorStations() {
    return apiClient.requestJson("/api/fmtuner/creator-stations/mine", { method: "GET" });
  },
  async createCreatorStation(payload) {
    return apiClient.requestJson("/api/fmtuner/creator-stations", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
};

export const getCountries = async (limit = 180) => {
  const data = await apiClient.requestJson("/api/fmtuner/rb/countries", { method: "GET" });
  const mapped = Array.isArray(data)
    ? data.map((item) => ({
        name: item.name || item.country || "",
        iso: item.iso_3166_1 || item.countrycode || item.iso || "",
        stationcount: item.stationcount || 0,
      }))
    : [];
  return mapped.filter((x) => x.iso).slice(0, Math.max(1, limit));
};

export const getPopularTags = async (countrycode, limit = 40) => {
  const data = await apiClient.requestJson(
    `/api/fmtuner/rb/tags${query({ countrycode, limit })}`,
    { method: "GET" }
  );
  return Array.isArray(data) ? data : [];
};

export const getStationsByRegionAndGenre = async ({
  countrycode,
  tag,
  limit = 30,
} = {}) => {
  const data = await apiClient.requestJson(
    `/api/fmtuner/rb/stations${query({ countryCode: countrycode, tag, limit })}`,
    { method: "GET" }
  );
  return Array.isArray(data) ? data : [];
};
