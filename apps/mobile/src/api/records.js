import apiClient from './client';

/** @returns {{ year: number, month: number, dates: Record<string, 'complete'|'partial'|'none'> }} */
export async function getMonthRecordStatus(year, month) {
  const response = await apiClient.get('/users/me/records/month-status', {
    params: { year, month },
  });
  return response.data;
}
