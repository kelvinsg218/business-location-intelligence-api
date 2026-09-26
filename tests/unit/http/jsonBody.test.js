'use strict';

const express = require('express');
const request = require('supertest');
const { jsonBody } = require('../../../src/middlewares/jsonBody');
const { errorHandler } = require('../../../src/middlewares/errorHandler');
const { ApiError } = require('../../../src/utils/ApiError');
const { requestId } = require('../../../src/middlewares/requestId');

function build() {
  const app = express();
  app.use(requestId);
  app.post('/echo', ...jsonBody(), (req, res) => res.json({ received: req.body === undefined ? '<undefined>' : req.body }));
  app.get('/db-down', () => {
    throw Object.assign(new Error('connect ECONNREFUSED 10.1.2.3:5432 (user=bli password=hunter2)'), { code: 'ECONNREFUSED', address: '10.1.2.3', port: 5432 });
  });
  app.get('/db-timeout', () => { throw new Error('timeout exceeded when trying to connect'); });
  app.get('/api-error', () => { throw new ApiError(418, 'TEAPOT', 'short and stout'); });
  app.get('/boom', () => { throw new Error('internal-detail-that-must-not-leak'); });
  app.use(errorHandler);
  return app;
}

const app = build();

describe('JSON body parsing', () => {
  it('parses a valid JSON object', async () => {
    const response = await request(app).post('/echo').send({ hello: 'world' });
    expect(response.status).toBe(200);
    expect(response.body.received).toEqual({ hello: 'world' });
  });

  it('accepts a charset parameter on the JSON content type', async () => {
    const response = await request(app).post('/echo').set('Content-Type', 'application/json; charset=utf-8').send('{"a":1}');
    expect(response.status).toBe(200);
  });

  it('leaves req.body undefined (Express 5) when the request has no body at all', async () => {
    const response = await request(app).post('/echo');
    expect(response.status).toBe(200);
    expect(response.body.received).toBe('<undefined>');
  });

  describe('malformed JSON -> 400 INVALID_JSON', () => {
    it.each([
      ['truncated object', '{"email": "a@b.co"'],
      ['not JSON at all', 'email=a@b.co'],
      ['trailing comma', '{"a":1,}'],
      ['single quotes', "{'a':1}"],
    ])('%s', async (_name, body) => {
      const response = await request(app).post('/echo').set('Content-Type', 'application/json').send(body);
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_JSON');
      expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
    });

    it('does not echo the offending input back', async () => {
      const response = await request(app).post('/echo').set('Content-Type', 'application/json').send('{"secret":"do-not-echo"');
      expect(JSON.stringify(response.body)).not.toContain('do-not-echo');
    });

    it('is strict: a bare JSON string or number is not an acceptable body', async () => {
      const response = await request(app).post('/echo').set('Content-Type', 'application/json').send('"just a string"');
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('INVALID_JSON');
    });
  });

  describe('oversized body -> 413 PAYLOAD_TOO_LARGE', () => {
    it('rejects a body over the 10kb limit', async () => {
      const response = await request(app).post('/echo').send({ padding: 'x'.repeat(11 * 1024) });
      expect(response.status).toBe(413);
      expect(response.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    });

    it('accepts a body just under the limit', async () => {
      const response = await request(app).post('/echo').send({ padding: 'x'.repeat(9 * 1024) });
      expect(response.status).toBe(200);
    });
  });

  describe('JSON only -> 415 UNSUPPORTED_MEDIA_TYPE', () => {
    it.each([
      ['application/x-www-form-urlencoded', 'a=1&b=2'],
      ['text/plain', 'a=1'],
      ['multipart/form-data; boundary=x', '--x\r\nContent-Disposition: form-data; name="a"\r\n\r\n1\r\n--x--'],
      ['application/xml', '<a>1</a>'],
    ])('refuses a %s body', async (contentType, body) => {
      const response = await request(app).post('/echo').set('Content-Type', contentType).send(body);
      expect(response.status).toBe(415);
      expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });

    it('refuses a body that declares no content type at all', async () => {
      const response = await request(app).post('/echo').set('Content-Type', '').send('{"a":1}');
      expect(response.status).toBe(415);
    });

    it('refuses a non-UTF charset (body-parser only decodes utf-*)', async () => {
      const response = await request(app).post('/echo').set('Content-Type', 'application/json; charset=iso-8859-1').send('{"a":1}');
      expect(response.status).toBe(415);
      expect(response.body.error.code).toBe('UNSUPPORTED_MEDIA_TYPE');
    });
  });
});

describe('errorHandler translations', () => {
  it('turns a database connection failure into 503 DATABASE_UNAVAILABLE without leaking host, port, user or password', async () => {
    const response = await request(app).get('/db-down');

    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('DATABASE_UNAVAILABLE');
    const text = JSON.stringify(response.body);
    ['10.1.2.3', '5432', 'ECONNREFUSED', 'hunter2', 'password', 'user=bli'].forEach((secret) => expect(text).not.toContain(secret));
    expect(response.body.error.requestId).toBe(response.headers['x-request-id']);
  });

  it('also translates a pool connect timeout', async () => {
    const response = await request(app).get('/db-timeout');
    expect(response.status).toBe(503);
    expect(response.body.error.code).toBe('DATABASE_UNAVAILABLE');
  });

  it('still passes ApiErrors through unchanged', async () => {
    const response = await request(app).get('/api-error');
    expect(response.status).toBe(418);
    expect(response.body.error).toMatchObject({ code: 'TEAPOT', message: 'short and stout' });
  });

  it('still answers 500 INTERNAL_SERVER_ERROR (generic) for an unknown error', async () => {
    const response = await request(app).get('/boom');
    expect(response.status).toBe(500);
    expect(response.body.error.code).toBe('INTERNAL_SERVER_ERROR');
    expect(JSON.stringify(response.body)).not.toContain('internal-detail-that-must-not-leak');
  });
});
