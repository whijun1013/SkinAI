/**
 * Resolves an image URL. If it's a relative static path (e.g. /static/...),
 * it prepends the given API base URL. Otherwise, it returns the URL as is.
 * 
 * @param {string} url - The original image URL
 * @param {string} apiBaseUrl - The backend API base URL
 * @returns {string} The resolved full URL
 */
export const resolveImageUrl = (url, apiBaseUrl) => {
  if (!url) return url;
  
  // If it's already a full HTTP/HTTPS URL or data URI, return as is
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  
  // If it's a relative static path, prepend the base URL
  if (url.startsWith('/static/')) {
    const base = apiBaseUrl ? apiBaseUrl.replace(/\/$/, '') : '';
    return `${base}${url}`;
  }
  
  return url;
};
