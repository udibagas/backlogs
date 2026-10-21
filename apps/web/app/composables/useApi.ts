interface SessionResponse {
  accessToken: string;
  user: { id: string; email: string; name: string; systemRole: "USER" | "ADMIN" };
}

interface ApiOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: Record<string, unknown> | FormData;
  query?: Record<string, string | number | undefined>;
  responseType?: "blob";
}

export function useApi() {
  const config = useRuntimeConfig();
  const accessToken = useState<string | null>("access-token", () => null);
  const currentUser = useState<SessionResponse["user"] | null>("current-user", () => null);

  async function raw<T>(path: string, options: ApiOptions = {}, authenticated = true) {
    const headers: Record<string, string> = {};
    if (authenticated && accessToken.value) headers.Authorization = `Bearer ${accessToken.value}`;
    return $fetch<T>(`${config.public.apiBase}${path}`, {
      method: options.method,
      body: options.body,
      query: options.query,
      responseType: options.responseType,
      headers,
      credentials: "include"
    });
  }

  async function refreshSession() {
    try {
      const result = await raw<SessionResponse>("/auth/refresh", { method: "POST" }, false);
      accessToken.value = result.accessToken;
      currentUser.value = result.user;
      return true;
    } catch {
      accessToken.value = null;
      currentUser.value = null;
      return false;
    }
  }

  async function request<T>(path: string, options: ApiOptions = {}) {
    try {
      return await raw<T>(path, options);
    } catch (error) {
      const status =
        typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 0;
      if (status !== 401 || path === "/auth/refresh") throw error;
      if (!(await refreshSession())) throw error;
      return raw<T>(path, options);
    }
  }

  async function signIn(path: "/auth/login" | "/auth/register", body: Record<string, string>) {
    const result = await raw<SessionResponse>(path, { method: "POST", body }, false);
    accessToken.value = result.accessToken;
    currentUser.value = result.user;
    return result.user;
  }

  async function ensureSession() {
    if (!accessToken.value && !(await refreshSession())) return false;
    try {
      currentUser.value = await request<SessionResponse["user"]>("/auth/me");
      return true;
    } catch {
      accessToken.value = null;
      currentUser.value = null;
      return false;
    }
  }

  async function signOut() {
    try {
      await raw("/auth/logout", { method: "POST" }, false);
    } finally {
      accessToken.value = null;
      currentUser.value = null;
    }
  }

  return { request, signIn, signOut, ensureSession, currentUser };
}
