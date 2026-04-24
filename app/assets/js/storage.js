export const storage = {
  get(key, fallback = null) {
    const value = window.localStorage.getItem(key);
    return value ?? fallback;
  },

  set(key, value) {
    window.localStorage.setItem(key, value);
  },

  remove(key) {
    window.localStorage.removeItem(key);
  },

  getJson(key, fallback = null) {
    try {
      const value = window.localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  },

  setJson(key, value) {
    window.localStorage.setItem(key, JSON.stringify(value));
  },
};

