import apiClient from "./client";

export async function getDailyFeatureSummary(date) {
  const response = await apiClient.get("/users/me/report/daily-feature-summary", {
    params: { date },
  });
  return response.data;
}
