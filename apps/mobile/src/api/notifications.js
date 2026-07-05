import apiClient from "./client";

export async function getNotificationSettings() {
  const response = await apiClient.get("/notifications/settings");
  return response.data;
}

export async function updateNotificationSettings(payload) {
  const response = await apiClient.put("/notifications/settings", payload);
  return response.data;
}

export async function registerNotificationToken(payload) {
  const response = await apiClient.post("/notifications/token", payload);
  return response.data;
}

export async function disableNotificationToken(payload) {
  const response = await apiClient.delete("/notifications/token", { data: payload });
  return response.data;
}

export async function getNotificationLogs(limit = 20, offset = 0, category = null) {
  const params = { limit, offset };
  if (category) {
    params.category = category;
  }
  const response = await apiClient.get("/notifications/logs", { params });
  return response.data;
}

export async function getNotificationUnreadCount() {
  const response = await apiClient.get("/notifications/unread-count");
  return response.data;
}

export async function markNotificationLogRead(logId) {
  const response = await apiClient.patch(`/notifications/logs/${logId}/read`);
  return response.data;
}

export async function markAllNotificationLogsRead() {
  const response = await apiClient.patch("/notifications/logs/read-all");
  return response.data;
}
