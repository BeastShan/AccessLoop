export function localScanUrl(input: string): URL {
  const url = URL.parse(input);
  if (
    !url ||
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    (url.hostname !== "127.0.0.1" && url.hostname !== "[::1]") ||
    url.username ||
    url.password
  ) {
    throw new Error("Scan URL must be an HTTP(S) loopback URL (127.0.0.1 or [::1]) without credentials.");
  }
  return url;
}
