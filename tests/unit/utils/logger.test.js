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
});
