import { describe, it, expect } from 'vitest';

// A guard against regressions: the front end must hold no credentials and keep
// no session state of its own. The only source of truth is the server-side
// session behind an HttpOnly cookie.

const sources = import.meta.glob(['/src/**/*.{js,jsx}', '!/src/**/*.test.{js,jsx}', '!/src/test/**'], {
  query: '?raw', import: 'default', eager: true,
});

// Comments are removed first: they are allowed to explain WHY there is no
// storage or token. A "//" only starts a comment at the start of a line or after
// whitespace, so URLs inside strings ("http://...") are left alone.
const withoutComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

const files = Object.entries(sources).map(([file, text]) => [file, withoutComments(text)]);
const offenders = (pattern) => files.filter(([, text]) => pattern.test(text)).map(([file]) => file);

describe('no client-side authentication', () => {
  it('scans the real application sources', () => {
    expect(files.length).toBeGreaterThan(20);
    expect(files.map(([file]) => file)).toContain('/src/api/apiClient.js');
  });

  it('the scan can actually see a violation (control)', () => {
    const sample = withoutComments("// fine: localStorage in a comment\nconst a = 'http://localhost:3000';\nlocalStorage.setItem('t', x);");
    expect(sample).toMatch(/localStorage\.setItem/);
    expect(sample).toMatch(/http:\/\/localhost:3000/);
    expect(sample).not.toMatch(/fine/);
  });

  it('never uses localStorage or sessionStorage', () => {
    expect(offenders(/\b(localStorage|sessionStorage)\b/)).toEqual([]);
  });

  it('has no hard-coded credential or development-login remnant', () => {
    expect(offenders(/devAuth|attemptLogin|DEV_USERNAME|DEV_PASSWORD|bli_dev_authenticated/)).toEqual([]);
    expect(offenders(/\broot\s*\/\s*1\b/)).toEqual([]);
  });

  it('never builds an Authorization header or reads document.cookie (the session cookie is HttpOnly)', () => {
    expect(offenders(/Authorization|Bearer\s/i)).toEqual([]);
    expect(offenders(/document\.cookie/)).toEqual([]);
  });

  it('only calls fetch through the shared client, which always sends credentials', () => {
    expect(offenders(/\bfetch\s*\(/)).toEqual(['/src/api/apiClient.js']);
    const client = withoutComments(sources['/src/api/apiClient.js']);
    expect(client).toMatch(/credentials:\s*'include'/);
  });

  it('no page hard-codes an absolute backend URL', () => {
    expect(offenders(/https?:\/\/localhost:\d+/)).toEqual([]);
  });
});
