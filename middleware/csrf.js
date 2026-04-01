/**
 * Double-submit cookie CSRF protection.
 *
 * How it works:
 * 1. On login, the server sets a `csrf_token` cookie (NOT HttpOnly, so JS can read it).
 * 2. The frontend reads this cookie and sends its value as the `X-CSRF-Token` header.
 * 3. The server compares the cookie value with the header value.
 * 4. An attacker on a different origin cannot read the cookie, so they cannot forge the header.
 *
 * Safe methods (GET, HEAD, OPTIONS) are exempt because they should not mutate state.
 */
export const csrfProtect = (req, res, next) => {
  // Skip for safe (read-only) methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const cookieToken = req.cookies?.csrf_token;
  const headerToken = req.headers['x-csrf-token'];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return res.status(403).json({ message: 'CSRF validation failed' });
  }

  next();
};
