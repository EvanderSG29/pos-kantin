import { api } from "./api.js";
import { APP_CONFIG } from "./config.js";
import { storage } from "./storage.js";

function readSession() {
  return storage.getJson(APP_CONFIG.STORAGE_KEYS.session);
}

function writeSession(session) {
  storage.setJson(APP_CONFIG.STORAGE_KEYS.session, session);
}

export function getStoredSession() {
  return readSession();
}

export function getStoredToken() {
  return readSession()?.token ?? "";
}

export async function loginWithPin(email, pin) {
  const response = await api.login(email, pin);
  const session = {
    token: response.data.token,
    user: response.data.user,
    expiresAt: response.data.expiresAt,
    useMockApi: Boolean(response.data.useMockApi),
  };
  writeSession(session);
  return session;
}

export async function restoreSession() {
  const current = readSession();
  if (!current?.token) return null;

  if (current.expiresAt && new Date(current.expiresAt).getTime() < Date.now()) {
    storage.remove(APP_CONFIG.STORAGE_KEYS.session);
    return null;
  }

  try {
    const response = await api.getCurrentUser(current.token);
    const session = {
      ...current,
      user: response.data.user,
      expiresAt: response.data.expiresAt ?? current.expiresAt,
      useMockApi: Boolean(response.data.useMockApi ?? current.useMockApi),
    };
    writeSession(session);
    return session;
  } catch (error) {
    storage.remove(APP_CONFIG.STORAGE_KEYS.session);
    return null;
  }
}

export async function logoutUser() {
  const token = getStoredToken();
  if (token) {
    try {
      await api.logout(token);
    } catch (error) {
      // no-op
    }
  }
  storage.remove(APP_CONFIG.STORAGE_KEYS.session);
}

