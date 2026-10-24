const ACCESS_TOKEN_KEY = "wiseravenshare_access_token";

const getApiBaseUrl = () => {
  const configured = import.meta.env.VITE_API_BASE_URL;
  if (configured) {
    return configured.replace(/\/$/, "");
  }

  if (typeof window !== "undefined" && window.location.port === "5173") {
    return "http://localhost:5242";
  }

  return "";
};

const API_BASE_URL = getApiBaseUrl();
const AUTH_ROUTE_PATHS = new Set(["/login", "/register"]);

let inMemoryToken = null;

const readStoredToken = () => {
  if (typeof window === "undefined" || !window.localStorage) {
    return inMemoryToken;
  }

  return window.localStorage.getItem(ACCESS_TOKEN_KEY) || window.localStorage.getItem("token");
};

const writeStoredToken = (token) => {
  inMemoryToken = token || null;
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }

  if (token) {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
    window.localStorage.setItem("token", token);
  } else {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem("token");
  }
};

export const resolveApiUrl = (path) => `${API_BASE_URL}${path}`;
const buildUrl = resolveApiUrl;

const parseResponseBody = async (response) => {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    return response.json();
  }

  const text = await response.text();
  return text ? { message: text } : null;
};

const requestJson = async (path, options = {}) => {
  const token = readStoredToken();
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { "Content-Type": "application/json" }),
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(buildUrl(path), {
    credentials: "include",
    ...options,
    headers,
  });

  const data = await parseResponseBody(response);
  if (!response.ok) {
    const error = new Error(data?.message || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
};

const request = async (path, options = {}) => {
  const token = readStoredToken();
  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : {}),
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(buildUrl(path), {
    credentials: "include",
    ...options,
    headers,
  });

  const data = await parseResponseBody(response);
  if (!response.ok) {
    const error = new Error(data?.message || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
};

const requestBlob = async (path, options = {}) => {
  const token = readStoredToken();
  const headers = { Accept: "audio/mpeg, application/json;q=0.9, */*;q=0.8", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(buildUrl(path), { credentials: "include", ...options, headers });
  if (!response.ok) {
    const data = await parseResponseBody(response);
    const error = new Error(data?.message || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return response.blob();
};

const normalizeSameOriginPath = (candidateUrl, origin) => {
  if (candidateUrl.origin !== origin) {
    return "/";
  }

  const path = `${candidateUrl.pathname}${candidateUrl.search}${candidateUrl.hash}`;
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return "/";
  }

  return path || "/";
};

const sanitizeReturnToForLogin = (rawTarget, depth = 0) => {
  if (typeof window === "undefined") {
    return "/";
  }

  if (depth > 6) {
    return "/";
  }

  try {
    const origin = window.location.origin;
    const target = new URL(rawTarget || window.location.href, origin);
    const normalizedPathname = target.pathname.toLowerCase().replace(/\/+$/, "") || "/";

    if (AUTH_ROUTE_PATHS.has(normalizedPathname)) {
      const nested = target.searchParams.get("returnTo");
      return nested ? sanitizeReturnToForLogin(nested, depth + 1) : "/";
    }

    target.searchParams.delete("returnTo");
    target.searchParams.delete("from_url");
    return normalizeSameOriginPath(target, origin);
  } catch {
    return "/";
  }
};

const uploadViaMediaController = async (
  file,
  {
    destinationFolder = "",
    title = "",
    description = "",
    publishToYouTube = false,
    publishToTikTok = false,
    publishToFacebook = false,
    youtubeChannelOrEmail = "",
    tiktokUsername = "",
    facebookPageOrProfile = "",
  } = {}
) => {
  if (!file) {
    throw new Error("No file provided for upload.");
  }

  const body = new FormData();
  body.append("file", file);
  body.append("destinationFolder", destinationFolder);
  body.append("title", title || file.name?.replace(/\.[^/.]+$/, "") || "Upload");
  body.append("description", description || "");
  body.append("publishToYouTube", publishToYouTube ? "true" : "false");
  body.append("publishToTikTok", publishToTikTok ? "true" : "false");
  body.append("publishToFacebook", publishToFacebook ? "true" : "false");
  body.append("YouTubeChannelOrEmail", youtubeChannelOrEmail || "");
  body.append("TikTokUsername", tiktokUsername || "");
  body.append("FacebookPageOrProfile", facebookPageOrProfile || "");

  const data = await request("/api/media/upload", { method: "POST", body });
  const mediaUrl = data?.mediaUrl || data?.filePath || data?.file?.mediaUrl || "";

  return {
    ...data,
    mediaUrl,
    file_url: mediaUrl,
    file_uri: mediaUrl,
  };
};

const FUNCTION_ROUTE_ALIASES = {
  SocialCrossPost: "social-cross-posts",
  ListMusicAnalyses: "list-music-analysis",
};

const toKebabCase = (value = "") =>
  value
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/_/g, "-")
    .toLowerCase();

const invokeFunction = async (name, payload = {}) => {
  const routeCandidates = Array.from(
    new Set([
      FUNCTION_ROUTE_ALIASES[name] || "",
      toKebabCase(name),
      name,
    ].filter(Boolean))
  );

  let lastError = null;
  for (const route of routeCandidates) {
    try {
      const data = await requestJson(`/api/functions/${encodeURIComponent(route)}`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      return { data };
    } catch (error) {
      lastError = error;
      if (error?.status !== 404) {
        throw error;
      }
    }
  }

  throw lastError || new Error(`Function '${name}' is unavailable.`);
};

const entityClient = (entityName) => ({
  async filter(query = {}, options = {}) {
    const data = await requestJson(`/api/entities/${encodeURIComponent(entityName)}/filter`, {
      method: "POST",
      body: JSON.stringify({ query, options }),
    });
    if (Array.isArray(data)) {
      return { items: data };
    }
    return data || { items: [] };
  },
  async count(query = {}) {
    const data = await requestJson(`/api/entities/${encodeURIComponent(entityName)}/count`, {
      method: "POST",
      body: JSON.stringify({ query }),
    });
    if (typeof data === "number") {
      return data;
    }
    return data?.count ?? data?.total ?? 0;
  },
  async aggregate(options = {}) {
    return requestJson(`/api/entities/${encodeURIComponent(entityName)}/aggregate`, {
      method: "POST",
      body: JSON.stringify(options),
    });
  },
  async create(payload) {
    return requestJson(`/api/entities/${encodeURIComponent(entityName)}`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  async update(id, payload) {
    return requestJson(`/api/entities/${encodeURIComponent(entityName)}/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  async updateMany(filter, update) {
    return requestJson(`/api/entities/${encodeURIComponent(entityName)}/bulk`, {
      method: "PATCH",
      body: JSON.stringify({ filter, update }),
    });
  },
  subscribe(handler) {
    if (entityName !== "LiveStream" || typeof handler !== "function") {
      return () => {};
    }

    let disposed = false;
    const seen = new Map();

    const pump = async () => {
      if (disposed) return;
      try {
        const snapshot = await requestJson(`/api/entities/${encodeURIComponent(entityName)}/filter`, {
          method: "POST",
          body: JSON.stringify({ query: {}, options: { limit: 100, sort: "-updated_date" } }),
        });

        const items = Array.isArray(snapshot)
          ? snapshot
          : (Array.isArray(snapshot?.items) ? snapshot.items : []);

        for (const item of items) {
          const id = String(item?.id || "");
          if (!id) continue;
          const signature = [
            item?.status || "",
            item?.chunk_sequence || 0,
            item?.current_chunk_uri || "",
            item?.updated_date || "",
          ].join("|");
          const previous = seen.get(id);
          seen.set(id, signature);
          if (previous !== undefined && previous !== signature) {
            handler({ type: "update", data: item });
          }
        }
      } catch {
        // Keep polling silently; callers already handle missing updates.
      }
    };

    const interval = window.setInterval(pump, 3000);
    void pump();
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  },
});

const entityProxy = new Proxy(
  {},
  {
    get: (_, entityName) => entityClient(entityName),
  }
);

export const apiClient = {
  podcastAudio: {
    convertForBrowser(trackId) {
      return requestBlob(`/api/ravensight/media/music/${encodeURIComponent(trackId)}/browser-compatible`, { method: "GET" });
    },
  },
  posts: {
    feed(page = 1, pageSize = 20) {
      return requestJson(`/api/posts/feed?page=${page}&pageSize=${pageSize}`, { method: "GET" });
    },
    createThread(payload) {
      return requestJson("/api/posts/threads", {
        method: "POST",
        body: JSON.stringify(payload || {}),
      });
    },
    trending(count = 20) {
      return requestJson(`/api/posts/trending?count=${count}`, { method: "GET" });
    },
    like(postId) {
      return requestJson(`/api/posts/${encodeURIComponent(postId)}/like`, { method: "POST" });
    },
    unlike(postId) {
      return requestJson(`/api/posts/${encodeURIComponent(postId)}/like`, { method: "DELETE" });
    },
    repost(postId) {
      return requestJson(`/api/posts/${encodeURIComponent(postId)}/repost`, { method: "POST" });
    },
    unrepost(postId) {
      return requestJson(`/api/posts/${encodeURIComponent(postId)}/repost`, { method: "DELETE" });
    },
    share(postId) {
      return requestJson(`/api/posts/${encodeURIComponent(postId)}/share`, { method: "POST" });
    },
    comments(postId, page = 1, pageSize = 100) {
      return requestJson(`/api/posts/${encodeURIComponent(postId)}/comments?page=${encodeURIComponent(String(page))}&pageSize=${encodeURIComponent(String(pageSize))}`, { method: "GET" });
    },
    addComment(postId, payload = {}) {
      return requestJson(`/api/posts/${encodeURIComponent(postId)}/comments`, {
        method: "POST",
        body: JSON.stringify(payload || {}),
      });
    },
    likeComment(commentId) {
      return requestJson(`/api/posts/comments/${encodeURIComponent(commentId)}/like`, { method: "POST" });
    },
    unlikeComment(commentId) {
      return requestJson(`/api/posts/comments/${encodeURIComponent(commentId)}/like`, { method: "DELETE" });
    },
    notInterested(postId) {
      return requestJson(`/api/posts/${encodeURIComponent(postId)}/not-interested`, { method: "POST" });
    },
    hideAuthor(postId) {
      return requestJson(`/api/posts/${encodeURIComponent(postId)}/hide-author`, { method: "POST" });
    },
  },
  auth: {
    setToken(token) {
      if (!token) {
        return;
      }
      writeStoredToken(token);
    },
    clearToken() {
      writeStoredToken(null);
    },
    async loginViaEmailPassword(email, password) {
      const data = await requestJson("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      const token = data?.token || data?.access_token;
      if (token) {
        writeStoredToken(token);
      }
      return {
        access_token: token,
        user: data?.user || null,
      };
    },
    async register(payload) {
      return requestJson("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    async me() {
      const token = readStoredToken();
      if (!token) {
        throw new Error("Not authenticated.");
      }

      const data = await requestJson("/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      const user = data?.user || null;
      if (!user) {
        return null;
      }

      const accessScope = typeof data?.accessScope === "string" ? data.accessScope : "";
      const teamRole = typeof data?.teamRole === "string" ? data.teamRole : "";
      const adminPassActive = data?.adminPassActive === true;
      const role = typeof user?.role === "string" ? user.role.toLowerCase() : "";
      const isAdmin = adminPassActive || accessScope.toLowerCase() === "admin" || role === "admin";

      return {
        ...user,
        accessScope,
        teamRole,
        adminPassActive,
        isAdmin,
      };
    },
    async isAuthenticated() {
      try {
        const user = await this.me();
        return Boolean(user);
      } catch {
        return false;
      }
    },
    redirectToLogin(nextUrl) {
      if (typeof window === "undefined") {
        return;
      }
      const returnTo = sanitizeReturnToForLogin(nextUrl);
      const loginUrl = new URL("/login", window.location.origin);
      if (returnTo !== "/") {
        loginUrl.searchParams.set("returnTo", returnTo);
      }

      const currentUrl = window.location.href;
      const nextLoginUrl = loginUrl.toString();
      if (currentUrl !== nextLoginUrl) {
        window.location.href = nextLoginUrl;
      }
    },
    async logout(redirectUrl) {
      try {
        await requestJson("/api/auth/logout", { method: "POST" });
      } finally {
        writeStoredToken(null);
      }
      if (typeof window !== "undefined" && redirectUrl) {
        window.location.href = redirectUrl;
      }
    },
    loginWithProvider(provider, fromUrl = "/") {
      if (typeof window === "undefined") {
        return;
      }
      const returnUrl = new URL(fromUrl, window.location.origin).toString();
      window.location.href = buildUrl(`/api/auth/oauth/${encodeURIComponent(provider)}/start?returnUrl=${encodeURIComponent(returnUrl)}`);
    },
    resetPasswordRequest(email) {
      return requestJson("/api/auth/reset-password-request", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
    },
    resetPassword({ resetToken, newPassword }) {
      return requestJson("/api/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token: resetToken, newPassword }),
      });
    },
  },
  app: {
    async getPublicSettings() {
      return {
        id: "wiseravenshare-local",
        public_settings: {},
      };
    },
  },
  pythonMatrix: {
    health() {
      return requestJson("/api/python-matrix/health", {
        method: "GET",
      });
    },
    databaseHealth() {
      return requestJson("/api/python-matrix/health/db", {
        method: "GET",
      });
    },
    history(limit = 10) {
      const query = new URLSearchParams({ limit: String(limit) });
      return requestJson(`/api/python-matrix/history?${query.toString()}`, {
        method: "GET",
      });
    },
    transpose(payload) {
      return requestJson("/api/python-matrix/transpose", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    multiply(payload) {
      return requestJson("/api/python-matrix/multiply", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
  },
  live: {
    agoraToken(channelName, uid = 0, role = "publisher") {
      const query = new URLSearchParams({
        channelName: String(channelName || ""),
        uid: String(uid),
        role: String(role || "publisher"),
      });
      return requestJson(`/api/live/agora/token?${query.toString()}`, {
        method: "GET",
      });
    },
    start(streamId, payload = {}) {
      return requestJson(`/api/live/${encodeURIComponent(streamId)}/start`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    presignSegment(streamId, payload = {}) {
      return requestJson(`/api/live/${encodeURIComponent(streamId)}/segments/presign`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    confirmSegment(streamId, segmentIndex) {
      return requestJson(`/api/live/${encodeURIComponent(streamId)}/segments/${encodeURIComponent(String(segmentIndex))}/confirm`, {
        method: "POST",
      });
    },
    end(streamId) {
      return requestJson(`/api/live/${encodeURIComponent(streamId)}/end`, {
        method: "POST",
      });
    },
    delete(streamId) {
      return requestJson(`/api/live/${encodeURIComponent(streamId)}`, {
        method: "DELETE",
      });
    },
    feed(viewerId, limit = 50) {
      const query = new URLSearchParams({
        viewer_id: String(viewerId || ""),
        limit: String(limit),
      });
      return requestJson(`/api/live/feed?${query.toString()}`, {
        method: "GET",
      });
    },
    keep(streamId) {
      return requestJson(`/api/live/${encodeURIComponent(streamId)}/keep`, {
        method: "POST",
      });
    },
    message(streamId, text) {
      return requestJson(`/api/live/${encodeURIComponent(streamId)}/message`, {
        method: "POST",
        body: JSON.stringify({ text }),
      });
    },
    expiry(streamId, userId) {
      const query = new URLSearchParams({ user_id: String(userId || "") });
      return requestJson(`/api/live/${encodeURIComponent(streamId)}/expiry?${query.toString()}`, {
        method: "GET",
      });
    },
  },
  ravensightMedia: {
    backup() {
      return requestJson("/api/ravensight/media/backup", { method: "POST" });
    },
    uploadMedia(file, fields = {}) {
      return uploadViaMediaController(file, fields);
    },
    listMusic() {
      return requestJson("/api/ravensight/media/music", { method: "GET" });
    },
    streamMusic(trackId) {
      return requestBlob(`/api/ravensight/media/music/${encodeURIComponent(trackId)}/stream`, { method: "GET" });
    },
    uploadMusic(file, fields = {}) {
      const body = new FormData();
      body.append("file", file);
      body.append("File", file);
      body.append("title", fields.title || file.name.replace(/\.[^/.]+$/, ""));
      body.append("artist", fields.artist || "");
      body.append("album", fields.album || "");
      body.append("genre", fields.genre || "");
      body.append("destinationFolder", fields.destinationFolder || "my-library");
      if (fields.fingerprint) body.append("fingerprint", fields.fingerprint);
      return request("/api/ravensight/media/music/save", { method: "POST", body });
    },
    deleteMusic(trackId) {
      return requestJson(`/api/ravensight/media/music/${encodeURIComponent(trackId)}`, { method: "DELETE" });
    },
    updateMusicInfo(trackId, info = {}) {
      return requestJson(`/api/ravensight/media/music/${encodeURIComponent(trackId)}/info`, {
        method: "PATCH",
        body: JSON.stringify(info),
      });
    },
    listVideos() {
      return requestJson("/api/ravensight/media/videos", { method: "GET" });
    },
    uploadVideo(file, fields = {}) {
      const body = new FormData();
      body.append("file", file);
      body.append("title", fields.title || file.name.replace(/\.[^/.]+$/, ""));
      body.append("description", fields.description || "");
      body.append("destinationFolder", fields.destinationFolder || "my-library");
      body.append("privacy", fields.privacy || "unlisted");
      body.append("storageMode", fields.storageMode || "permanent");
      body.append("isPermanent", fields.isPermanent === false ? "false" : "true");
      return request("/api/ravensight/media/videos/save", { method: "POST", body });
    },
    deleteVideo(videoId) {
      return requestJson(`/api/ravensight/media/videos/${encodeURIComponent(videoId)}`, { method: "DELETE" });
    },
    listPhotos(limit = 100) {
      return requestJson(`/api/ravensight/media/photos?limit=${encodeURIComponent(String(limit))}`, { method: "GET" });
    },
    uploadPhoto(file, fields = {}) {
      const body = new FormData();
      body.append("file", file);
      body.append("caption", fields.caption || file.name.replace(/\.[^/.]+$/, ""));
      body.append("destinationFolder", fields.destinationFolder || "");
      return request("/api/ravensight/media/photos/save", { method: "POST", body });
    },
    deletePhoto(photoId) {
      return requestJson(`/api/ravensight/media/photos/${encodeURIComponent(photoId)}`, { method: "DELETE" });
    },
  },
  radio: {
    getChannels() { return requestJson('/api/radio/channels', { method: 'GET' }); },
    getChannel(id) { return requestJson(`/api/radio/channels/${encodeURIComponent(id)}`, { method: 'GET' }); },
  },
  news: {
    getBulletin(params = {}) {
      const query = new URLSearchParams();
      if (params.region) {
        query.set("region", params.region);
      }
      if (params.topic) {
        query.set("topic", params.topic);
      }
      if (params.language) {
        query.set("language", params.language);
      }
      if (params.limit) {
        query.set("limit", String(params.limit));
      }

      const suffix = query.toString();
      return requestJson(`/api/news/bulletin${suffix ? `?${suffix}` : ""}`, {
        method: "GET",
      });
    },
    search(params = {}) {
      const query = new URLSearchParams();
      if (params.q) {
        query.set("q", params.q);
      }
      if (params.language) {
        query.set("language", params.language);
      }
      if (params.limit) {
        query.set("limit", String(params.limit));
      }

      const suffix = query.toString();
      return requestJson(`/api/news/search${suffix ? `?${suffix}` : ""}`, {
        method: "GET",
      });
    },
    trending(params = {}) {
      const query = new URLSearchParams();
      if (params.language) {
        query.set("language", params.language);
      }
      if (params.limit) {
        query.set("limit", String(params.limit));
      }

      const suffix = query.toString();
      return requestJson(`/api/news/trending${suffix ? `?${suffix}` : ""}`, {
        method: "GET",
      });
    },
  },
  payments: {
    getConfig() {
      return requestJson("/api/payments/config", {
        method: "GET",
      });
    },
    getCatalog() {
      return requestJson("/api/payments/catalog", {
        method: "GET",
      });
    },
    getHealth() {
      return requestJson("/api/payments/health", {
        method: "GET",
      });
    },
  },
  billing: {
    getSubscription() {
      return requestJson("/api/billing/subscription", {
        method: "GET",
      });
    },
    createCheckoutSession(payload) {
      return requestJson("/api/billing/checkout-session", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
    createPortalSession(payload) {
      return requestJson("/api/billing/portal-session", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
  },
  functions: {
    invoke: invokeFunction,
  },
  integrations: {
    Core: {
      UploadPublicFile: async ({ file, folder = "media", title = "", description = "" } = {}) =>
        uploadViaMediaController(file, {
          destinationFolder: folder,
          title,
          description,
        }),
      UploadPrivateFile: async ({ file, folder = "private", title = "", description = "" } = {}) =>
        uploadViaMediaController(file, {
          destinationFolder: folder,
          title,
          description,
        }),
    },
  },
  entities: entityProxy,
  connectors: {
    async connectAppUser(connectorId) {
      const data = await requestJson(`/api/connectors/${encodeURIComponent(connectorId)}/connect`, {
        method: "POST",
      });
      return data?.url || data?.connectUrl || "/settings";
    },
    async status(connectorId) {
      return requestJson(`/api/connectors/${encodeURIComponent(connectorId)}/status`, {
        method: "GET",
      });
    },
    async disconnectAppUser(connectorId) {
      return requestJson(`/api/connectors/${encodeURIComponent(connectorId)}/disconnect`, {
        method: "POST",
      });
    },
  },
  savedMedia: {
    async getLibrary(page = 1, pageSize = 100) {
      const query = new URLSearchParams({
        page: String(page),
        pageSize: String(pageSize),
      });
      return requestJson(`/api/SavedMedia/library?${query.toString()}`, { method: "GET" });
    },
    async save(payload) {
      return requestJson("/api/SavedMedia/save", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    },
  },
  // Social platform connect/disconnect via server OAuth flow
  social: {
    followStatus(userId) {
      return requestJson(`/api/follow/status/${encodeURIComponent(userId)}`, { method: "GET" });
    },
    toggleFollow(userId) {
      return requestJson("/api/follow/toggle", { method: "POST", body: JSON.stringify({ targetUserId: userId }) });
    },
    myBlocks() {
      return requestJson("/api/users/me/blocks", { method: "GET" });
    },
    getUser(userId) {
      return requestJson(`/api/users/${encodeURIComponent(userId)}`, { method: "GET" });
    },
    blockUser(userId) {
      return requestJson(`/api/users/${encodeURIComponent(userId)}/block`, { method: "POST" });
    },
    unblockUser(userId) {
      return requestJson(`/api/users/${encodeURIComponent(userId)}/block`, { method: "DELETE" });
    },
    getSocialConnectUrl(platform, userId, returnUrl) {
      const params = new URLSearchParams({
        user_id: userId,
        return_url: returnUrl,
      });
      return requestJson(`/api/auth/${encodeURIComponent(platform)}/start?${params.toString()}`, {
        method: "GET",
      });
    },
    getStatus(platform) {
      return requestJson(`/api/auth/${encodeURIComponent(platform)}/status`, {
        method: "GET",
      });
    },
    saveDetails(platform, userId, fields) {
      return requestJson(`/api/auth/${encodeURIComponent(platform)}/complete`, {
        method: "POST",
        body: JSON.stringify({ user_id: userId, fields }),
      });
    },
    disconnect(platform, userId) {
      return requestJson(`/api/auth/${encodeURIComponent(platform)}/disconnect`, {
        method: "POST",
        body: JSON.stringify({ user_id: userId }),
      });
    },
  },
  studio: {
    createProject(payload) { return requestJson('/api/studio-projects', { method: 'POST', body: JSON.stringify(payload) }); },
    getProjects() { return requestJson('/api/studio-projects', { method: 'GET' }); },
    getProject(id) { return requestJson(`/api/studio-projects/${id}`, { method: 'GET' }); },
    updateProject(id, payload) { return requestJson(`/api/studio-projects/${id}`, { method: 'PUT', body: JSON.stringify(payload) }); },
    deleteProject(id) { return requestJson(`/api/studio-projects/${id}`, { method: 'DELETE' }); },
    createTrack(projectId, payload) { return requestJson(`/api/studio-projects/${projectId}/tracks`, { method: 'POST', body: JSON.stringify(payload) }); },
    updateTrack(projectId, trackId, payload) { return requestJson(`/api/studio-projects/${projectId}/tracks/${trackId}`, { method: 'PUT', body: JSON.stringify(payload) }); },
    deleteTrack(projectId, trackId) { return requestJson(`/api/studio-projects/${projectId}/tracks/${trackId}`, { method: 'DELETE' }); },
    uploadRecording(projectId, file, trackName) { const fd = new FormData(); fd.append('file', file); fd.append('trackName', trackName || 'Recording'); return request(`/api/studio-projects/${projectId}/upload-recording`, { method: 'POST', body: fd }); },
    getEditHistory(projectId) { return requestJson(`/api/studio-projects/${projectId}/history`, { method: 'GET' }); },
    undoEdit(projectId) { return requestJson(`/api/studio-projects/${projectId}/undo`, { method: 'POST' }); },
    redoEdit(projectId) { return requestJson(`/api/studio-projects/${projectId}/redo`, { method: 'POST' }); },
  },
  // Expose raw authenticated request for custom use
  requestJson,
};
