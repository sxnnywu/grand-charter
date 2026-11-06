export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly fieldErrors?: Record<string, string>) {
    super(message);
  }
}

export function isAccessError(error: unknown): error is ApiError {
  return error instanceof ApiError && [401, 403, 404].includes(error.status);
}

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, { cache: "no-store", ...options });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("Couldn’t reach the server. Check your connection and try again.");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok || data === null) {
    const fieldErrors = data?.fieldErrors && typeof data.fieldErrors === "object" && !Array.isArray(data.fieldErrors)
      ? Object.fromEntries(Object.entries(data.fieldErrors).filter((entry): entry is [string, string] => typeof entry[1] === "string")) : undefined;
    throw new ApiError(response.status, data?.error ?? "The workspace couldn’t finish that request. Try again.", fieldErrors);
  }
  return data as T;
}

export function post<T>(path: string, body: Record<string, string>, headers?: Record<string, string>) {
  return request<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

export function messageFor(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}
