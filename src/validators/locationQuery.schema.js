'use strict';

const { z } = require('zod');

function parseKeywords(raw) {
  if (!raw) return [];
  const seen = new Set();
  const result = [];
  raw
    .split(',')
    .map((keyword) => keyword.trim())
    .filter(Boolean)
    .forEach((keyword) => {
      const key = keyword.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(keyword);
      }
    });
  return result;
}

function buildLocationQuerySchema(maxRadiusKm) {
  return z
    .object({
      location: z
        .string({ error: 'location is required' })
        .trim()
        .min(2, 'location must be between 2 and 200 characters')
        .max(200, 'location must be between 2 and 200 characters'),
      businessType: z
        .string({ error: 'businessType is required' })
        .trim()
        .min(2, 'businessType must be between 2 and 100 characters')
        .max(100, 'businessType must be between 2 and 100 characters'),
      radius: z.coerce
        .number({ error: 'radius is required and must be a number' })
        .min(0.1, `radius must be between 0.1 and ${maxRadiusKm} (km)`)
        .max(maxRadiusKm, `radius must be between 0.1 and ${maxRadiusKm} (km)`),
      keywords: z.string().trim().max(300, 'keywords must be at most 300 characters').optional(),
    })
    .transform((data) => ({ ...data, keywords: parseKeywords(data.keywords) }));
}

function validateLocationQuery(query, maxRadiusKm) {
  const schema = buildLocationQuerySchema(maxRadiusKm);
  const result = schema.safeParse(query);

  if (result.success) {
    return { success: true, data: result.data };
  }

  const details = result.error.issues.map((issue) => ({
    field: issue.path.join('.') || 'query',
    message: issue.message,
  }));

  return { success: false, details };
}

module.exports = { buildLocationQuerySchema, validateLocationQuery, parseKeywords };
