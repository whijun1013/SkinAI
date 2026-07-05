import apiClient from "./client";

export async function getDailyFeatureSummary(date) {
  const response = await apiClient.get("/users/me/report/daily-feature-summary", {
    params: { date },
  });
  return response.data;
}

export async function getWeeklyNutrientSummary(date) {
  const response = await apiClient.get("/users/me/report/weekly-nutrient-summary", {
    params: { date },
  });
  return response.data;
}
