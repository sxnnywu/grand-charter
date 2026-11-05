export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { cache: "no-store", ...options });
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null) {
    throw new Error(data?.error ?? "The workspace couldn’t finish that request. Try again.");
  }
  return data as T;
}

export function post<T>(path: string, body: Record<string, string>) {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function messageFor(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}
