export function normalizeAllowedOrigins(values: string[]): string[] {
  const normalized = values.map((value) => {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new Error(`ALLOWED_ORIGINS contains an invalid origin: "${value}".`);
    }
    if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== "/")) {
      throw new Error(`ALLOWED_ORIGINS entries must be bare HTTP(S) origins; received "${value}".`);
    }
    return url.origin;
  });
  return [...new Set(normalized)];
}

export function isAllowedBrowserOrigin(origin: string | undefined, allowedOrigins: readonly string[]): boolean {
  if (!origin) return false;
  try {
    return allowedOrigins.includes(new URL(origin).origin);
  } catch {
    return false;
  }
}
