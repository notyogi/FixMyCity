import { supabase } from './supabaseClient';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

type SlowRequestSubscriber = (isSlow: boolean) => void;
const slowSubscribers = new Set<SlowRequestSubscriber>();
let activeSlowCount = 0;

export function subscribeToSlowRequests(callback: SlowRequestSubscriber): () => void {
  slowSubscribers.add(callback);
  return () => {
    slowSubscribers.delete(callback);
  };
}

function updateSlowState(isSlow: boolean): void {
  if (isSlow) {
    activeSlowCount++;
  } else if (activeSlowCount > 0) {
    activeSlowCount--;
  }

  const showingSlow = activeSlowCount > 0;
  slowSubscribers.forEach((cb) => cb(showingSlow));
}

const DEFAULT_BASE_URL = 'http://localhost:5001/api/v1';

export function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/+$/, '');
  }
  return DEFAULT_BASE_URL;
}

/**
 * apiClient - Authenticated fetch wrapper for the FixMyCity Express API
 * - Prefixes VITE_API_BASE_URL
 * - Automatically attaches current Supabase Bearer access token
 * - Parses JSON and throws typed ApiError
 * - 30-second timeout with 5-second cold-start warning listener
 * - Auto-handles 401 (sign out -> /login) and 403 (clear unauthorized notice)
 */
export async function apiClient<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const baseUrl = getApiBaseUrl();
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const fullUrl = `${baseUrl}${normalizedEndpoint}`;

  // Retrieve current active Supabase auth session
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...((options.headers as Record<string, string>) || {}),
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 30000); // 30-second timeout

  let isSlowTriggered = false;
  const slowTimer = setTimeout(() => {
    isSlowTriggered = true;
    updateSlowState(true);
  }, 5000); // 5-second slow response threshold

  try {
    const response = await fetch(fullUrl, {
      ...options,
      headers,
      signal: controller.signal,
    });

    if (!response.ok) {
      let errorMessage = response.statusText;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error || errorData.message || errorMessage;
      } catch {
        // Fall back to statusText if response is not JSON
      }

      if (response.status === 401) {
        // Token expired or invalid -> sign out and redirect to login
        await supabase.auth.signOut();
        if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
        throw new ApiError(401, 'Session expired. Please log in again.');
      }

      if (response.status === 403) {
        throw new ApiError(
          403,
          'Your account does not have admin access. Please contact municipal administration.'
        );
      }

      throw new ApiError(response.status, errorMessage);
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return {} as T;
    }

    return (await response.json()) as T;
  } catch (error: unknown) {
    if (error instanceof ApiError) {
      throw error;
    }

    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiError(
        408,
        'Request timed out after 30 seconds. The server might still be waking up, please retry.'
      );
    }

    const message = error instanceof Error ? error.message : 'Network request failed';
    throw new ApiError(0, message);
  } finally {
    clearTimeout(timeoutId);
    clearTimeout(slowTimer);
    if (isSlowTriggered) {
      updateSlowState(false);
    }
  }
}

