/** A "go back to" address from a query string is only followed when it is a path inside this site (never an outside address). */
export function safeNext(next: string | undefined | null, prefix = "/", fallback = "/"): string {
  const n = (next ?? "").trim();
  if (!n.startsWith(prefix) || n.startsWith("//") || n.includes("\\") || n.includes("\n") || n.startsWith("/admin/login") || n.startsWith("/account/login")) return fallback;
  return n;
}
