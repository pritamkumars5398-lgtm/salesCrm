const STORAGE_KEY = "sa_user";

export async function authSignup(name: string, email: string, password: string): Promise<{ error?: string }> {
  try {
    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || "Signup failed." };

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: name.trim(), email }));
    return {};
  } catch {
    return { error: "Network error. Please try again." };
  }
}

export async function authLogin(email: string, password: string): Promise<{ user?: { name: string; email: string }; error?: string }> {
  try {
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) return { error: data.error || "Login failed." };

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ name: data.name, email: data.email }));
    return { user: { name: data.name, email: data.email } };
  } catch {
    return { error: "Network error. Please try again." };
  }
}

export function getStoredUser(): { name: string; email: string } | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return null;
  try {
    const u = JSON.parse(stored);
    return { name: u.name, email: u.email };
  } catch {
    localStorage.removeItem(STORAGE_KEY);
    return null;
  }
}

/** Ends the server session (HttpOnly cookie) and forgets the cached profile. */
export async function authLogout(): Promise<void> {
  localStorage.removeItem(STORAGE_KEY);
  try {
    await fetch("/api/auth/logout", { method: "POST" });
  } catch (err) {
    console.error("[auth] logout request failed", err);
  }
}

/**
 * Whether the server still has a valid session. The cached profile in
 * localStorage alone is not enough — it outlives expired or pre-upgrade
 * sessions, and trusting it sends the user into a redirect loop.
 * Clears the cached profile when the session is gone.
 */
export async function hasServerSession(): Promise<boolean> {
  try {
    const res = await fetch("/api/auth/me");
    if (res.ok) return true;
    if (res.status === 401) localStorage.removeItem(STORAGE_KEY);
    return false;
  } catch {
    return false;
  }
}
