'use strict';

const { validateLocationQuery, parseKeywords } = require('../../../src/validators/locationQuery.schema');

const MAX_RADIUS_KM = 20;

describe('validateLocationQuery', () => {
  it('accepts a valid query and coerces radius to a number', () => {
    const result = validateLocationQuery(
      { location: 'Vila Velha, ES', businessType: 'gym', radius: '5' },
      MAX_RADIUS_KM,
    );

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      location: 'Vila Velha, ES', businessType: 'gym', radius: 5, keywords: [],
    });
  });

  it('trims location and businessType', () => {
    const result = validateLocationQuery(
      { location: '  Vila Velha, ES  ', businessType: '  gym  ', radius: '5' },
      MAX_RADIUS_KM,
    );
    expect(result.data.location).toBe('Vila Velha, ES');
    expect(result.data.businessType).toBe('gym');
  });

  it('splits, trims and dedupes keywords (case-insensitive dedup, first occurrence kept)', () => {
    const result = validateLocationQuery(
      {
        location: 'Vila Velha, ES', businessType: 'gym', radius: '5', keywords: ' crossfit ,24 horas,CrossFit,',
      },
      MAX_RADIUS_KM,
    );
    expect(result.data.keywords).toEqual(['crossfit', '24 horas']);
  });

  it('rejects a missing location', () => {
    const result = validateLocationQuery({ businessType: 'gym', radius: '5' }, MAX_RADIUS_KM);
    expect(result.success).toBe(false);
    expect(result.details).toContainEqual(expect.objectContaining({ field: 'location' }));
  });

  it('rejects a missing businessType', () => {
    const result = validateLocationQuery({ location: 'Vila Velha, ES', radius: '5' }, MAX_RADIUS_KM);
    expect(result.success).toBe(false);
    expect(result.details).toContainEqual(expect.objectContaining({ field: 'businessType' }));
  });

  it('rejects a missing radius', () => {
    const result = validateLocationQuery({ location: 'Vila Velha, ES', businessType: 'gym' }, MAX_RADIUS_KM);
    expect(result.success).toBe(false);
    expect(result.details).toContainEqual(expect.objectContaining({ field: 'radius' }));
  });

  it('rejects a non-numeric radius', () => {
    const result = validateLocationQuery(
      { location: 'Vila Velha, ES', businessType: 'gym', radius: 'abc' },
      MAX_RADIUS_KM,
    );
    expect(result.success).toBe(false);
  });

  it('rejects radius below 0.1', () => {
    const result = validateLocationQuery(
      { location: 'Vila Velha, ES', businessType: 'gym', radius: '0.05' },
      MAX_RADIUS_KM,
    );
    expect(result.success).toBe(false);
  });

  it('rejects radius above MAX_RADIUS_KM', () => {
    const result = validateLocationQuery(
      { location: 'Vila Velha, ES', businessType: 'gym', radius: '21' },
      MAX_RADIUS_KM,
    );
    expect(result.success).toBe(false);
  });

  it('accepts radius exactly at the max boundary', () => {
    const result = validateLocationQuery(
      { location: 'Vila Velha, ES', businessType: 'gym', radius: String(MAX_RADIUS_KM) },
      MAX_RADIUS_KM,
    );
    expect(result.success).toBe(true);
  });

  it('rejects a too-short location', () => {
    const result = validateLocationQuery({ location: 'a', businessType: 'gym', radius: '5' }, MAX_RADIUS_KM);
    expect(result.success).toBe(false);
  });

  it('reports multiple field errors at once', () => {
    const result = validateLocationQuery({ radius: '999' }, MAX_RADIUS_KM);
    expect(result.success).toBe(false);
    const fields = result.details.map((d) => d.field);
    expect(fields).toEqual(expect.arrayContaining(['location', 'businessType', 'radius']));
  });
});

describe('parseKeywords', () => {
  it('returns an empty array for falsy input', () => {
    expect(parseKeywords(undefined)).toEqual([]);
    expect(parseKeywords('')).toEqual([]);
  });

  it('drops empty entries from stray commas', () => {
    expect(parseKeywords('a,,b,')).toEqual(['a', 'b']);
  });
});
