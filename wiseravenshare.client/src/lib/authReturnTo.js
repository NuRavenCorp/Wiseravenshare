// Shared by the auth pages (Login, Register, and any page that resumes a flow
// after sign-in, e.g. the MCP OAuth consent page). Keep the redirect
// validation in one place — it is security-sensitive and easy to drift.

// Resolve ?returnTo= to a safe same-origin path, else "/".
//
// The same-origin check alone is not enough: a value like /.//evil.com or
// /\evil.com parses same-origin but normalizes to a protocol-relative
// //evil.com when assigned to location.href — an open redirect. So require the
// resolved path to be exactly one leading slash (no "//" prefix, no backslash).
const AUTH_ROUTE_PATHS = new Set(["/login", "/register"]);

function resolveSafeReturnPath(raw, depth = 0) {
  if (!raw || depth > 6) return "/";

  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return "/";

    const normalizedPathname = url.pathname.toLowerCase().replace(/\/+$/, "") || "/";
    if (AUTH_ROUTE_PATHS.has(normalizedPathname)) {
      const nestedReturnTo = url.searchParams.get("returnTo");
      return nestedReturnTo ? resolveSafeReturnPath(nestedReturnTo, depth + 1) : "/";
    }

    // Only access_token/clear_access_token are still URL-read by app-params.js, but the
    // whole bootstrap set stays stripped: one going back to a URL read must not silently
    // become injectable again. Normal app-flow params (e.g. the OAuth consent ctx) are kept.
    for (const p of ["access_token", "clear_access_token", "app_id", "app_base_url", "functions_version", "from_url", "returnTo"]) {
      url.searchParams.delete(p);
    }

    const path = url.pathname + url.search;
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return "/";
    return path || "/";
  } catch {
    return "/";
  }
}

export function safeReturnTo() {
  let raw = null;
  try {
    raw = new URLSearchParams(window.location.search).get("returnTo");
  } catch {
    raw = null;
  }
  return resolveSafeReturnPath(raw);
}
