/** Same-origin API helper. In dev the Vite proxy forwards /api to the server. */
export interface ApiResponse<T = unknown> {
  status: number;
  data: T;
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<ApiResponse<T>> {
  const res = await fetch(`/api${path}`, {
    method: options.method ?? "GET",
    credentials: "include",
    headers: options.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  let data: any = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, data: data as T };
}

export interface AuthUser {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  country: string;
  role: string;
  balanceReal: number;
  balanceDemo: number;
  kycStatus: string;
  customYieldRatio: number | null;
  forceLossUser: boolean;
  isBlocked: boolean;
  isSuperAdmin: boolean;
  isStaff: boolean;
  permissions?: string[];
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AuthError {
  error?: string;
  fields?: Record<string, string>;
  requiresTwoFactor?: boolean;
}
