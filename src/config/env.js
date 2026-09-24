'use strict';

const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config({ quiet: true });

function booleanString(defaultValue) {
  return z
    .string()
    .optional()
    .transform((value) => (value === undefined ? defaultValue : value.trim().toLowerCase() === 'true'));
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
});

function loadEnv(source) {
  const result = envSchema.safeParse(source === undefined ? process.env : source);
  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }
  return result.data;
}

const env = loadEnv();

module.exports = { env, loadEnv, envSchema };
