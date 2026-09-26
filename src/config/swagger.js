'use strict';

const swaggerJsdoc = require('swagger-jsdoc');
const { version } = require('../../package.json');

function buildSwaggerSpec() {
  return swaggerJsdoc({
    definition: {
      openapi: '3.0.0',
      info: {
        title: 'Business Location Intelligence API',
        version,
        description: 'Analyzes business competition within a radius of a free-text location, using Google Geocoding + Places (New) APIs. '
          + 'Access is by account: create one with `POST /api/v1/auth/register` (or sign in with `/login`); the session cookie '
          + 'that comes back is what authorizes `GET /api/v1/locations/analyze`. In this page, sign in first and Swagger UI '
          + 'sends the cookie along with "Try it out".',
      },
      servers: [{ url: '/' }],
      tags: [
        { name: 'Auth', description: 'Accounts and sessions' },
        { name: 'Locations', description: 'Competitive analysis (requires a session)' },
        { name: 'Operations', description: 'Liveness and readiness probes' },
      ],
      components: {
        securitySchemes: {
          cookieAuth: {
            type: 'apiKey',
            in: 'cookie',
            name: 'bli_sid',
            description: 'Opaque session cookie set by register/login (HttpOnly, SameSite=Strict). It is named '
              + '`__Host-bli_sid` when the API runs over HTTPS (production) and `bli_sid` on local HTTP.',
          },
        },
        schemas: {
          PublicUser: {
            type: 'object',
            description: 'The only representation of an account the API ever returns. It never includes the password or its hash.',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string', example: 'Maria Souza' },
              email: { type: 'string', format: 'email', example: 'maria@example.com' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    apis: ['./src/routes/**/*.js', './src/modules/**/*.js'],
  });
}

module.exports = { buildSwaggerSpec };
