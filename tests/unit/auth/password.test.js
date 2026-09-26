'use strict';

const argon2 = require('argon2');
const {
  ARGON2_OPTIONS, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, createPasswordService, normalizePassword, validatePasswordPolicy,
} = require('../../../src/modules/auth/password');
const { isCommonPassword } = require('../../../src/modules/auth/commonPasswords');

// Real Argon2id, but with cheap parameters so the suite stays fast. The
// production parameters are asserted separately below.
const CHEAP = { type: argon2.argon2id, memoryCost: 1024, timeCost: 1, parallelism: 1 };

describe('password policy', () => {
  it('has the approved limits: 12 to 128 characters', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(12);
    expect(PASSWORD_MAX_LENGTH).toBe(128);
  });

  it('accepts a 12-character password without any uppercase, digit or symbol (no composition rules)', () => {
    expect(validatePasswordPolicy('correcthorse')).toEqual([]);
    expect(validatePasswordPolicy('tres pratos de trigo para tres tigres')).toEqual([]);
  });

  it('rejects 11 characters and accepts exactly 12 (boundary)', () => {
    expect(validatePasswordPolicy('a1b2c3d4e5f').map((i) => i.code)).toEqual(['PASSWORD_TOO_SHORT']);
    expect(validatePasswordPolicy('vermelho-azul')).toEqual([]);
    expect(validatePasswordPolicy('x9k2m7q4w8zp')).toEqual([]); // exactly 12
  });

  it('accepts exactly 128 characters and rejects 129 (boundary)', () => {
    const ok = 'ab'.repeat(30) + 'xyz7'.repeat(17); // 60 + 68 = 128, not a repetition of one unit
    expect(ok).toHaveLength(128);
    expect(validatePasswordPolicy(ok)).toEqual([]);
    expect(validatePasswordPolicy(`${ok}q`).map((i) => i.code)).toEqual(['PASSWORD_TOO_LONG']);
  });

  it('counts characters as Unicode code points, not UTF-16 units (an emoji is one character)', () => {
    const emojis = '🙂'.repeat(11) + 'a'; // 12 characters, 23 UTF-16 units
    expect([...emojis]).toHaveLength(12);
    expect(validatePasswordPolicy(emojis).map((i) => i.code)).not.toContain('PASSWORD_TOO_SHORT');
    expect(validatePasswordPolicy('🙂'.repeat(11)).map((i) => i.code)).toEqual(['PASSWORD_TOO_SHORT']);
  });

  it('measures length after NFC normalization (composed and decomposed accents count the same)', () => {
    const composed = 'coração-forte'; // 13 code points
    const decomposed = composed.normalize('NFD'); // 15 code points before normalization
    expect(validatePasswordPolicy(decomposed)).toEqual(validatePasswordPolicy(composed));
  });

  it('rejects a password that is the e-mail, its local part, or the name (with digits appended)', () => {
    const account = { email: 'kelvin.simoes@example.com', name: 'Kelvin Simões' };
    expect(validatePasswordPolicy('kelvin.simoes@example.com', account).map((i) => i.code)).toEqual(['PASSWORD_CONTAINS_PERSONAL_INFO']);
    expect(validatePasswordPolicy('kelvinsimoes2026', account).map((i) => i.code)).toEqual(['PASSWORD_CONTAINS_PERSONAL_INFO']);
    expect(validatePasswordPolicy('KELVIN SIMOES 99', account).map((i) => i.code)).toEqual(['PASSWORD_CONTAINS_PERSONAL_INFO']);
  });

  it('still accepts a long passphrase that merely contains the name', () => {
    const account = { email: 'kelvin.simoes@example.com', name: 'Kelvin Simões' };
    expect(validatePasswordPolicy('o gato do kelvin simoes dorme no sofa', account)).toEqual([]);
  });

  it('ignores very short names/e-mail parts (they would flag ordinary words)', () => {
    expect(validatePasswordPolicy('anaanaanaxyz9', { email: 'a@b.co', name: 'Ana' }).map((i) => i.code)).not.toContain('PASSWORD_CONTAINS_PERSONAL_INFO');
  });
});

describe('common / obviously weak passwords', () => {
  it.each([
    'password1234', 'Password123456!', 'P@ssw0rd2024!!', 'passwordpassword', 'senha1234567', 'minhasenha123', 'Senha-Forte-2024',
    'qwertyuiop123', 'qwertyuiopasdf', '1qaz2wsx3edc', '1q2w3e4r5t6y', 'zxcvbnm12345',
    '123456789012', '1234567890123', '098765432109', 'abcdefghijkl', 'aaaaaaaaaaaa', '111111111111',
    'abababababab', '121212121212', 'abcabcabcabc', '112233445566',
    'iloveyou1234', 'welcome12345', 'letmein12345', 'administrator', 'mudar@1234567', 'brasil123456', 'flamengo2024!',
    'business-location', 'BusinessLocation1', 'bli-bli-bli-bli',
  ])('flags %s as too common', (password) => {
    expect(isCommonPassword(password)).toBe(true);
    expect(validatePasswordPolicy(password).map((i) => i.code)).toEqual(['PASSWORD_TOO_COMMON']);
  });

  it.each([
    'correcthorsebatterystaple', 'x9k2m7q4w8zp', 'tres pratos de trigo para tres tigres', 'meu cachorro chama Thor e mora em Vitoria',
    'chuva-de-verao-4-meses', 'Cafe com leite e pao de queijo', 'vermelho-azul-8', 'o rato roeu a roupa do rei de roma',
  ])('does not flag %s', (password) => {
    expect(isCommonPassword(password)).toBe(false);
    expect(validatePasswordPolicy(password)).toEqual([]);
  });

  it('a word merely contained in a longer passphrase is fine (only decoration around a common word is rejected)', () => {
    expect(isCommonPassword('password mas com muitas outras palavras diferentes')).toBe(false);
  });

  it('reports the length problem first, without noise about being common', () => {
    expect(validatePasswordPolicy('senha').map((i) => i.code)).toEqual(['PASSWORD_TOO_SHORT']);
  });
});

describe('NFC normalization', () => {
  it('turns the decomposed form into the composed one', () => {
    expect(normalizePassword('Senáha')).toBe('Senáha');
  });

  it('makes the same visible password verify whichever form was typed (hash and verify both normalize)', async () => {
    const service = createPasswordService({ options: CHEAP });
    const hash = await service.hash('Senáha-longa-é-forte'); // composed
    await expect(service.verify(hash, 'Senáha-longa-é-forte')).resolves.toBe(true); // decomposed
  });
});

describe('hashing (Argon2id)', () => {
  it('uses the approved production parameters', () => {
    expect(ARGON2_OPTIONS).toEqual({
      type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1,
    });
    expect(Object.isFrozen(ARGON2_OPTIONS)).toBe(true);
  });

  it('produces an Argon2id PHC string carrying m=19456, t=2, p=1 by default', async () => {
    const hash = await createPasswordService().hash('correct horse battery staple');
    // The library serializes the parameters in m,p,t order.
    expect(hash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2\$/);
  });

  it('never contains the plaintext password, and uses a fresh salt every time', async () => {
    const service = createPasswordService({ options: CHEAP });
    const password = 'correct horse battery staple';
    const [first, second] = await Promise.all([service.hash(password), service.hash(password)]);

    expect(first).not.toContain(password);
    expect(first).not.toEqual(second);
  });

  it('verifies the right password and rejects a wrong one', async () => {
    const service = createPasswordService({ options: CHEAP });
    const hash = await service.hash('correct horse battery staple');

    await expect(service.verify(hash, 'correct horse battery staple')).resolves.toBe(true);
    await expect(service.verify(hash, 'correct horse battery stapler')).resolves.toBe(false);
  });

  it('returns false (does not throw) for a malformed stored hash', async () => {
    const service = createPasswordService({ options: CHEAP });
    await expect(service.verify('not-a-hash', 'whatever password')).resolves.toBe(false);
    await expect(service.verify('', 'whatever password')).resolves.toBe(false);
  });

  it('needsRehash is true for a hash made with weaker parameters, false for current ones', async () => {
    const weak = createPasswordService({ options: CHEAP });
    const strong = createPasswordService({ options: { ...CHEAP, timeCost: 3 } });
    const weakHash = await weak.hash('correct horse battery staple');

    expect(weak.needsRehash(weakHash)).toBe(false);
    expect(strong.needsRehash(weakHash)).toBe(true);
  });

  it('verifyAgainstDummy spends real verification work and never throws (for unknown accounts)', async () => {
    const service = createPasswordService({ options: CHEAP });
    const verifySpy = jest.spyOn(argon2, 'verify');

    await expect(service.verifyAgainstDummy('some password')).resolves.toBeUndefined();
    await expect(service.verifyAgainstDummy('another one!!')).resolves.toBeUndefined();

    expect(verifySpy).toHaveBeenCalledTimes(2);
    verifySpy.mockRestore();
  });
});
