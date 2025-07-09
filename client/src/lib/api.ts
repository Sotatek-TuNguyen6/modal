import { getSession } from "next-auth/react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://api.inhoanglinh.click';

/**
 * Fetch wrapper that automatically includes auth token
 */
export async function fetchWithAuth(
  endpoint: string,
  options: RequestInit = {}
) {
  // Get the session to access the token
  const session = await getSession();
  const token = session?.accessToken;

  // Prepare headers with auth token if available
  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    // Handle 401 Unauthorized errors
    if (response.status === 401) {
      // Let the useAuth hook handle token refresh or redirect to login
      throw new Error("Unauthorized");
    }

    // Parse JSON response
    const data = await response.json();

    // If the response is not ok, throw an error
    if (!response.ok) {
      throw new Error(data.message || "API request failed");
    }

    return data;
  } catch (error) {
    console.error("API request error:", error);
    throw error;
  }
}

/**
 * Helper for GET requests
 */
export function get(endpoint: string, options: RequestInit = {}) {
  return fetchWithAuth(endpoint, {
    ...options,
    method: "GET",
  });
}

/**
 * Helper for POST requests
 */
export function post(endpoint: string, data: unknown, options: RequestInit = {}) {
  return fetchWithAuth(endpoint, {
    ...options,
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * Helper for PUT requests
 */
export function put(endpoint: string, data: unknown, options: RequestInit = {}) {
  return fetchWithAuth(endpoint, {
    ...options,
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/**
 * Helper for DELETE requests
 */
export function del(endpoint: string, options: RequestInit = {}) {
  return fetchWithAuth(endpoint, {
    ...options,
    method: "DELETE",
  });
}