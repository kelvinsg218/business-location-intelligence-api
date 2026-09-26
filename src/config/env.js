'use strict';

const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config({ quiet: true });

// Only ever used outside production, so that `npm run dev` works with a minimal
// .env. In production a real secret is mandatory (see the refinement below).
const DEV_SESSION_SECRET = 'dev-only-insecure-session-secret-never-use-in-production';
const MIN_SESSION_SECRET_LENGTH = 32;

function booleanString(defaultValue) {
  return z
    .string()
    .optional()
    .transform((value) => (value === undefined ? defaultValue : value.trim().toLowerCase() === 'true'));
}

// "a, b,c" -> ['a', 'b', 'c'] (empty/absent -> []).
function commaList() {
  return z
    .string()
    .optional()
    .transform((value) => (value ? value.split(',').map((item) => item.trim()).filter(Boolean) : []));
}

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  GOOGLE_MAPS_API_KEY: z.string().optional().default(''),
  USE_MOCK_GEOCODING: booleanString(true),
  USE_MOCK_PLACES: booleanString(true),
  ENABLE_COMMERCIAL_ECOSYSTEM: booleanString(true),
  MAX_RADIUS_KM: z.coerce.number().positive().default(20),
  GRID_MIN_RADIUS_KM: z.coerce.number().positive().default(3),
  MAX_SEARCH_POINTS: z.coerce.number().int().positive().default(7),
  MAX_PAGES_PER_POINT: z.coerce.number().int().min(1).max(3).default(1),
  HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  // PostgreSQL. DATABASE_URL is optional here so the app can be imported (tests,
  // tooling) without a database; server.js refuses to start without it.
  DATABASE_URL: z.string().optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  DATABASE_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
  DATABASE_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  DATABASE_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
  DATABASE_SSL: z.enum(['disable', 'require']).default('disable'),

  // Sessions and authentication.
  SESSION_SECRET: z.string().optional(),
  SESSION_IDLE_TTL_DAYS: z.coerce.number().positive().default(7),
  SESSION_ABSOLUTE_TTL_DAYS: z.coerce.number().positive().default(30),
  SESSION_COOKIE_SECURE: booleanString(true),
  SESSION_COOKIE_SAMESITE: z.enum(['strict', 'lax']).default('strict'),
  ALLOWED_ORIGINS: commaList(),
  CORS_ORIGINS: commaList(),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  REGISTRATION_ENABLED: booleanString(true),
  ANALYZE_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(30),
  ANALYZE_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().positive().default(60),
});

function normalizeOrigins(list, field, ctx) {
  return list.flatMap((item) => {
    try {
      return [new URL(item).origin];
    } catch {
      ctx.addIssue({ code: 'custom', path: [field], message: `"${item}" is not a valid origin (expected e.g. https://app.example.com)` });
      return [];
    }
  });
}

const refinedSchema = envSchema.transform((data, ctx) => {
  const isProduction = data.NODE_ENV === 'production';

  // SESSION_SECRET may hold several comma-separated secrets (the first one signs
  // new cookies, the others are still accepted, which allows rotation).
  const configuredSecrets = (data.SESSION_SECRET || '').split(',').map((item) => item.trim()).filter(Boolean);
  const shortSecret = configuredSecrets.some((secret) => secret.length < MIN_SESSION_SECRET_LENGTH);

  if (isProduction) {
    if (configuredSecrets.length === 0 || shortSecret) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_SECRET'],
        message: `is required in production and every secret must be at least ${MIN_SESSION_SECRET_LENGTH} characters`,
      });
    }
    if (data.ALLOWED_ORIGINS.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['ALLOWED_ORIGINS'], message: 'is required in production (the public origin of the app)' });
    }
    if (!data.SESSION_COOKIE_SECURE) {
      ctx.addIssue({ code: 'custom', path: ['SESSION_COOKIE_SECURE'], message: 'must be true in production' });
    }
  } else if (shortSecret) {
    ctx.addIssue({
      code: 'custom',
      path: ['SESSION_SECRET'],
      message: `every secret must be at least ${MIN_SESSION_SECRET_LENGTH} characters when set`,
    });
  }

  if (data.SESSION_IDLE_TTL_DAYS > data.SESSION_ABSOLUTE_TTL_DAYS) {
    ctx.addIssue({
      code: 'custom',
      path: ['SESSION_IDLE_TTL_DAYS'],
      message: 'cannot be longer than SESSION_ABSOLUTE_TTL_DAYS',
    });
  }

  // Outside production the dev front end (Vite) and the API's own Swagger UI are
  // allowed by default, so a fresh checkout works without any origin config.
  const devOrigins = [
    'http://localhost:5173', 'http://127.0.0.1:5173',
    `http://localhost:${data.PORT}`, `http://127.0.0.1:${data.PORT}`,
  ];
  const allowedOrigins = normalizeOrigins(data.ALLOWED_ORIGINS, 'ALLOWED_ORIGINS', ctx);
  // The raw SESSION_SECRET is dropped from the parsed object on purpose: only the
  // resolved list is exposed, so the value is never one property access away.
  const { SESSION_SECRET: _rawSecret, ...rest } = data;

  return {
    ...rest,
    ALLOWED_ORIGINS: allowedOrigins.length > 0 || isProduction ? allowedOrigins : devOrigins,
    CORS_ORIGINS: normalizeOrigins(data.CORS_ORIGINS, 'CORS_ORIGINS', ctx),
    SESSION_SECRETS: configuredSecrets.length > 0 ? configuredSecrets : [DEV_SESSION_SECRET],
  };
});

function loadEnv(source) {
  const result = refinedSchema.safeParse(source === undefined ? process.env : source);
  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return result.data;
}

const env = loadEnv();

module.exports = {
  env, loadEnv, envSchema: refinedSchema, DEV_SESSION_SECRET,
};
