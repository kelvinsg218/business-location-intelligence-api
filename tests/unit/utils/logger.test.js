'use strict';

const { createLogger } = require('../../../src/utils/logger');

function createCaptureStream() {
  const chunks = [];
  return {
    write(chunk) {
      chunks.push(chunk);
      return true;
    },
    getEntries() {
      return chunks
        .join('')
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    },
  };
}

describe('logger', () => {
  it('redacts an apiKey field so the secret never reaches the output', () => {
    const capture = createCaptureStream();
    const logger = createLogger(capture, { level: 'info' });

    logger.info({ apiKey: 'super-secret-value' }, 'calling provider');

    const entries = capture.getEntries();
    expect(entries).toHaveLength(1);
    expect(JSON.stringify(entries)).not.toContain('super-secret-value');
  });

  it('redacts the x-goog-api-key header if ever logged', () => {
    const capture = createCaptureStream();
    const logger = createLogger(capture, { level: 'info' });

    logger.info({ headers: { 'x-goog-api-key': 'super-secret-value' } }, 'outgoing request');

    const entries = capture.getEntries();
    expect(entries).toHaveLength(1);
    expect(JSON.stringify(entries)).not.toContain('super-secret-value');
  });

  it('redacts the request Cookie header so a session token can never reach the logs', () => {
    const capture = createCaptureStream();
    const logger = createLogger(capture, { level: 'info' });

    logger.info({ req: { method: 'GET', headers: { cookie: 'sid=super-secret-value', accept: 'application/json' } } }, 'request');

    const entries = capture.getEntries();
    expect(entries).toHaveLength(1);
    expect(JSON.stringify(entries)).not.toContain('super-secret-value');
    expect(entries[0].req.headers.accept).toBe('application/json');
  });

  it('redacts the response Set-Cookie header so a newly issued session token can never reach the logs', () => {
    const capture = createCaptureStream();
    const logger = createLogger(capture, { level: 'info' });

    logger.info({ res: { statusCode: 200, headers: { 'set-cookie': ['sid=super-secret-value; HttpOnly'], 'content-type': 'application/json' } } }, 'response');

    const entries = capture.getEntries();
    expect(entries).toHaveLength(1);
    expect(JSON.stringify(entries)).not.toContain('super-secret-value');
    expect(entries[0].res.headers['content-type']).toBe('application/json');
  });
});
