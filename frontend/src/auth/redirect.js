// Where to go after signing in: back to the protected page the visitor was
// trying to open, but only if it is inside the app. Anything else (a foreign
// path, something a crafted link put in the navigation state) falls back to /app.
export const DEFAULT_AFTER_LOGIN = '/app';

export function afterLoginPath(location) {
  const from = location && location.state && location.state.from;
  if (!from || typeof from.pathname !== 'string') return DEFAULT_AFTER_LOGIN;
  const { pathname, search = '', hash = '' } = from;
  const insideApp = pathname === '/app' || pathname.startsWith('/app/');
  return insideApp ? `${pathname}${search}${hash}` : DEFAULT_AFTER_LOGIN;
}
