import apiClient from './client';

export async function upsertUserLocation(payload) {
  const response = await apiClient.post('/users/me/locations', {
    location_type: payload.location_type,
    location_name: payload.location_name,
    lat: payload.lat,
    lng: payload.lng,
  });
  return response.data;
}

export async function getUserLocations() {
  const response = await apiClient.get('/users/me/locations');
  return response.data;
}

export async function getUserLocationByType(locationType) {
  const response = await apiClient.get(`/users/me/locations/${locationType}`);
  return response.data;
}

export async function deleteUserLocation(locationType) {
  await apiClient.delete(`/users/me/locations/${locationType}`);
}
