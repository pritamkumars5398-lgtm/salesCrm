/**
 * When any API call comes back 401 the server session is gone (expired,
 * password changed, signed out elsewhere). Send the user to the login page
 * once instead of leaving every screen half-broken. A "Workspace not found"
 * means the open workspace was deleted or the user lost access to it.
 */
if (typeof window !== "undefined" && !(window as unknown as { __sessionGuard__?: boolean }).__sessionGuard__) {
  (window as unknown as { __sessionGuard__?: boolean }).__sessionGuard__ = true;
  const originalFetch = window.fetch;
  let redirecting = false;

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit) {
    const response = await originalFetch(input, init);
    if ((response.status === 401 || response.status === 404) && !redirecting) {
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.startsWith("http") ? new URL(url).pathname : url;
      if (path.startsWith("/api/") && !path.startsWith("/api/auth/")) {
        if (response.status === 401) {
          redirecting = true;
          localStorage.removeItem("sa_user");
          window.location.replace("/?session=expired");
        } else {
          // Access to the open workspace was removed (or it was deleted) — reload into one the user can open.
          const body = await response.clone().json().catch(() => null);
          if (body?.error === "Workspace not found." && !window.location.pathname.endsWith("/default")) {
            redirecting = true;
            window.location.replace("/dashboard/default");
          }
        }
      }
    }
    return response;
  };
}

export {};
