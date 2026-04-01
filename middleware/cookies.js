import { randomUUID } from 'node:crypto';

const isProduction = process.env.NODE_ENV === 'production';

/**
 * Cookie options for cross-origin SPA ↔ API setups.
 * - Production: SameSite=None + Secure (required for cross-origin cookies)
 * - Development: SameSite=Lax (works on localhost without HTTPS)
 */
const baseCookieOpts = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'none' : 'lax',
  path: '/',
};

const ACCESS_TOKEN_MAX_AGE = 15 * 60 * 1000; // 15 minutes
const REFRESH_TOKEN_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Set access token, refresh token, and CSRF token cookies on the response.
 */
export const setAuthCookies = (res, accessToken, refreshToken, csrfToken) => {
  res.cookie('access_token', accessToken, {
    ...baseCookieOpts,
    maxAge: ACCESS_TOKEN_MAX_AGE,
  });

  res.cookie('refresh_token', refreshToken, {
    ...baseCookieOpts,
    maxAge: REFRESH_TOKEN_MAX_AGE,
  });

  // CSRF cookie must be readable by JavaScript (httpOnly: false)
  res.cookie('csrf_token', csrfToken, {
    httpOnly: false,
    secure: isProduction,
    sameSite: isProduction ? 'none' : 'lax',
    path: '/',
    maxAge: REFRESH_TOKEN_MAX_AGE,
  });
};

/**
 * Clear all auth cookies.
 */
export const clearAuthCookies = (res) => {
  const clearOpts = { ...baseCookieOpts, maxAge: 0 };
  res.cookie('access_token', '', clearOpts);
  res.cookie('refresh_token', '', clearOpts);
  res.cookie('csrf_token', '', { ...clearOpts, httpOnly: false });
};

/**
 * Generate a new CSRF token.
 */
export const generateCsrfToken = () => randomUUID();

export { ACCESS_TOKEN_MAX_AGE, REFRESH_TOKEN_MAX_AGE };
