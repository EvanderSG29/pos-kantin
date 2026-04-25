import { api } from "./api.js";

let currentSession = null;

export function getStoredSession() {
  return currentSession;
}

export function getStoredToken() {
  return currentSession?.token ?? "";
}

export async function loginWithPassword(email, password, rememberDevice = false) {
  const response = await api.login(email, password, rememberDevice);
  currentSession = response.data;
  return currentSession;
}

export async function loginWithPin(email, pin) {
  const response = await api.loginWithPin(email, pin);
  currentSession = response.data;
  return currentSession;
}

export async function loginSavedProfile(userId) {
  const response = await api.loginSavedProfile(userId);
  currentSession = response.data;
  return currentSession;
}

export async function restoreSession() {
  try {
    const response = await api.getCurrentUser(currentSession?.token ?? "");
    currentSession = response.data;
    return currentSession;
  } catch (error) {
    currentSession = null;
    return null;
  }
}

export async function logoutUser() {
  try {
    await api.logout(currentSession?.token ?? "");
  } finally {
    currentSession = null;
  }
}
