async function request(path, options = {}) {
  const method = String(options.method || "GET").toUpperCase();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
    headers["X-CSRF-Token"] = readCookie("nsap_csrf");
  }

  const response = await fetch(path, {
    credentials: "same-origin",
    headers,
    ...options,
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json() : await response.text();

  if (!response.ok) {
    const message = normalizeErrorMessage(response.status, payload);
    console.error("API request failed", {
      path,
      method,
      status: response.status,
      response: payload,
    });
    const error = new Error(message);
    error.status = response.status;
    error.path = path;
    error.method = method;
    throw error;
  }

  return payload;
}

function normalizeErrorMessage(status, payload) {
  const serverMessage = payload?.error || "";
  if (status === 401) {
    return serverMessage || "Session expired. Please log in again.";
  }
  if (status === 403 && /csrf/i.test(serverMessage)) {
    return "Session expired. Please refresh and try again.";
  }
  return serverMessage || `Request failed: ${status}`;
}

function readCookie(name) {
  return document.cookie
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`))
    ?.slice(name.length + 1) || "";
}

export const api = {
  getSession() {
    return request("/api/session");
  },
  getCreators() {
    return request("/api/creators");
  },
  createCreator(payload) {
    return request("/api/creators", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  updateCreator(creatorId, field, value) {
    return request(`/api/creators/${encodeURIComponent(creatorId)}`, {
      method: "PATCH",
      body: JSON.stringify({ field, value }),
    });
  },
  updateCreatorProfile(creatorId, payload) {
    return request(`/api/creators/${encodeURIComponent(creatorId)}/profile`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
  },
  deleteCreator(creatorId, confirmation) {
    return request(`/api/creators/${encodeURIComponent(creatorId)}`, {
      method: "DELETE",
      body: JSON.stringify({ confirmation }),
    });
  },
  addTimelineEntry(creatorId, payload) {
    return request(`/api/creators/${encodeURIComponent(creatorId)}/timeline`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  markDmSent(creatorId) {
    return request(`/api/creators/${encodeURIComponent(creatorId)}/mark-dm-sent`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
  syncYouTubeCreator(creatorId) {
    return request(`/api/creators/${encodeURIComponent(creatorId)}/sync/youtube`, { method: "POST", body: JSON.stringify({}) });
  },
  startYouTubeSyncAll() {
    return request("/api/sync/youtube/all", { method: "POST", body: JSON.stringify({}) });
  },
  getYouTubeSyncJob(jobId) {
    return request(`/api/sync/youtube/jobs/${encodeURIComponent(jobId)}`);
  },
  importCreators(payload) {
    return request("/api/import", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  exportCreators() {
    return request("/api/export");
  },
  getUsers() {
    return request("/api/users");
  },
  updateUserRole(discordId, role) {
    return request(`/api/users/${encodeURIComponent(discordId)}/role`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
  },
  getAudit() {
    return request("/api/audit");
  },
  getBackups() {
    return request("/api/backups");
  },
  createBackup() {
    return request("/api/backups", {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
  restoreBackup(id) {
    return request(`/api/backups/${encodeURIComponent(id)}/restore`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
  logout() {
    return request("/auth/logout", {
      method: "POST",
      body: JSON.stringify({}),
    });
  },
};
