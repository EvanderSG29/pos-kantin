import { restoreSession } from "./auth.js";
import { goTo, routeForRole } from "./router.js";

export async function requireGuest() {
  const session = await restoreSession();
  if (session?.user) {
    goTo(routeForRole(session.user.role));
    return session;
  }
  return null;
}

export async function requireAuth({ roles = [] } = {}) {
  const session = await restoreSession();
  if (!session?.user) {
    goTo("login");
    return null;
  }

  if (roles.length && !roles.includes(session.user.role)) {
    goTo(routeForRole(session.user.role));
    return null;
  }

  return session;
}

