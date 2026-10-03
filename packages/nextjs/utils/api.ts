export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    if (text) {
      try {
        const json = JSON.parse(text) as { error?: string; message?: string };
        if (json && (json.error || json.message)) {
          throw new Error(json.error || json.message);
        }
      } catch (err) {
        if (err instanceof Error && err.message !== text) throw err;
      }
    }
    throw new Error(text || `${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}
