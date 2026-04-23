import { restoreSession } from "./auth.js";
import { goTo, routeForRole } from "./router.js";

export async function requireGuest() {
  const session = await restoreSession();
  if (session?.user) {
    await goTo(routeForRole(session.user.role), { replace: true });
    return session;
  }
  return null;
}

export async function requireAuth({ roles = [] } = {}) {
  const session = await restoreSession();
  if (!session?.user) {
    await goTo("login", { replace: true });
    return null;
  }

  if (roles.length && !roles.includes(session.user.role)) {
    await goTo(routeForRole(session.user.role), { replace: true });
    return null;
  }

  return session;
}
