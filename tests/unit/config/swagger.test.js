'use strict';

const { buildSwaggerSpec } = require('../../../src/config/swagger');
const pkg = require('../../../package.json');

describe('buildSwaggerSpec', () => {
  it('publishes the product version from package.json, so the docs can never drift from the released version', () => {
    expect(buildSwaggerSpec().info.version).toBe(pkg.version);
  });

  it('documents the analyze endpoint without promising opportunities, and explains the opportunityScore field', () => {
    const operation = buildSwaggerSpec().paths['/api/v1/locations/analyze'].get;

    expect(operation.summary).not.toMatch(/opportunity/i);
    expect(operation.description).toMatch(/opportunityScore/);
    expect(operation.description).toMatch(/not a measure of demand or a recommendation/i);
  });

  describe('authentication', () => {
    const spec = buildSwaggerSpec();

    it('documents the four auth endpoints with the right methods', () => {
      expect(Object.keys(spec.paths['/api/v1/auth/register'])).toEqual(['post']);
      expect(Object.keys(spec.paths['/api/v1/auth/login'])).toEqual(['post']);
      expect(Object.keys(spec.paths['/api/v1/auth/logout'])).toEqual(['post']);
      expect(Object.keys(spec.paths['/api/v1/auth/me'])).toEqual(['get']);
    });

    it('declares the session cookie as the security scheme', () => {
      expect(spec.components.securitySchemes.cookieAuth).toMatchObject({ type: 'apiKey', in: 'cookie', name: 'bli_sid' });
    });

    it('marks /analyze and /me as requiring it, and documents the 401', () => {
      const analyze = spec.paths['/api/v1/locations/analyze'].get;
      const me = spec.paths['/api/v1/auth/me'].get;

      expect(analyze.security).toEqual([{ cookieAuth: [] }]);
      expect(me.security).toEqual([{ cookieAuth: [] }]);
      expect(analyze.responses['401']).toBeDefined();
      expect(me.responses['401']).toBeDefined();
    });

    it('does not require it on register, login, logout or the probes', () => {
      ['/api/v1/auth/register', '/api/v1/auth/login', '/api/v1/auth/logout'].forEach((route) => {
        expect(spec.paths[route].post.security).toBeUndefined();
      });
      expect(spec.paths['/health'].get.security).toBeUndefined();
      expect(spec.paths['/ready'].get.security).toBeUndefined();
    });

    it('documents /health (liveness, no database) and /ready (readiness, 200/503)', () => {
      expect(spec.paths['/health'].get.description).toMatch(/does not touch the database/i);
      expect(Object.keys(spec.paths['/ready'].get.responses)).toEqual(expect.arrayContaining(['200', '503']));
    });

    it('defines the public user without any password field', () => {
      const properties = Object.keys(spec.components.schemas.PublicUser.properties);

      expect(properties.sort()).toEqual(['createdAt', 'email', 'id', 'name']);
    });

    it('lists the error statuses that clients must handle on the credential endpoints', () => {
      const register = spec.paths['/api/v1/auth/register'].post.responses;
      const login = spec.paths['/api/v1/auth/login'].post.responses;

      expect(Object.keys(register)).toEqual(expect.arrayContaining(['201', '400', '403', '409', '413', '415', '429', '503']));
      expect(Object.keys(login)).toEqual(expect.arrayContaining(['200', '400', '401', '403', '429', '503']));
    });
  });
});
