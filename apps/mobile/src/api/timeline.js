import apiClient from "./client";

export async function getTimelineSummary(startDate, endDate) {
  const response = await apiClient.get("/users/me/report/timeline", {
    params: { start_date: startDate, end_date: endDate },
  });
  return response.data;
}
