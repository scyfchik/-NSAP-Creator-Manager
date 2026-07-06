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
    throw new Error(payload?.error || `Request failed: ${response.status}`);
  }

  return payload;
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
  updateCreator(creatorId, field, value) {
    return request(`/api/creators/${encodeURIComponent(creatorId)}`, {
      method: "PATCH",
      body: JSON.stringify({ field, value }),
    });
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
