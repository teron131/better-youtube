/**
 * Cookie utility functions
 */

const DEFAULT_COOKIE_EXPIRY_DAYS = 365;

export function setCookie(name: string, value: string, days: number = DEFAULT_COOKIE_EXPIRY_DAYS): void {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${encodeURIComponent(value)};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
}

export function getCookie(name: string): string | null {
  const nameEQ = `${name}=`;
  const cookies = document.cookie.split(';');

  for (const cookie of cookies) {
    const trimmed = cookie.trimStart();
    if (trimmed.startsWith(nameEQ)) {
      return decodeURIComponent(trimmed.substring(nameEQ.length));
    }
  }

  return null;
}

export function deleteCookie(name: string): void {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;SameSite=Lax`;
}

export function getCookieAsJSON<T>(name: string, defaultValue: T): T {
  try {
    const cookieData = getCookie(name);
    return cookieData ? JSON.parse(cookieData) : defaultValue;
  } catch (error) {
    console.warn(`Failed to parse cookie "${name}":`, error);
    return defaultValue;
  }
}

export function setCookieAsJSON<T>(name: string, value: T, days?: number): void {
  try {
    setCookie(name, JSON.stringify(value), days);
  } catch (error) {
    console.warn(`Failed to save cookie "${name}":`, error);
  }
}
