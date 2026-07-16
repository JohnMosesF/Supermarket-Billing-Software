const AUTH_TOKEN_KEY = 'supermarket-auth-token';
const REMEMBER_KEY = 'supermarket-remember-session';

export function getStoredToken() {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(AUTH_TOKEN_KEY) || sessionStorage.getItem(AUTH_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token, remember = true) {
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      const target = remember ? localStorage : sessionStorage;
      const other = remember ? sessionStorage : localStorage;
      target.setItem(AUTH_TOKEN_KEY, token);
      other.removeItem(AUTH_TOKEN_KEY);
      localStorage.setItem(REMEMBER_KEY, remember ? 'true' : 'false');
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
    }
  } catch {
    // ignore storage failures
  }
}

export function clearStoredToken() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
  } catch {
    // ignore storage failures
  }
}

export function getRememberSession() {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(REMEMBER_KEY) !== 'false';
  } catch {
    return true;
  }
}
