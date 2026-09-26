import { createContext, useContext } from 'react';

// What the app knows about the visitor. `status` is one of:
//   'loading'          asking the server whether a session exists (first paint)
//   'authenticated'    `user` is the signed-in account
//   'unauthenticated'  no session (never signed in, signed out, or it expired)
//   'unavailable'      the server could not be reached to find out
export const AuthContext = createContext(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
}
