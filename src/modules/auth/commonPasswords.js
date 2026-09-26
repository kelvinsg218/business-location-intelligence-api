'use strict';

// "Obviously weak" password detection. The policy deliberately has no
// composition rules (no "one uppercase, one digit, one symbol"): those push
// people towards `Password1!`. Instead this rejects what attackers try first:
// well-known base words with decoration, keyboard/alphabet/digit runs, and
// repetitions. It is a small, local, dependency-free filter, not a breach
// database; checking against known-breached passwords (e.g. HIBP's k-anonymity
// API) is a possible later addition.

// Common base words, in English and Portuguese. A password is rejected when,
// after undoing "leet" substitutions and dropping digits/punctuation/spaces, what
// is left is exactly one of these (so `P@ssw0rd2024!` and `senha-1234` fail, while
// a passphrase that merely contains a word does not).
const COMMON_BASE_WORDS = new Set([
  'password', 'passwd', 'pass', 'senha', 'senhas', 'minhasenha', 'senhaforte', 'senhasegura', 'senhasecreta',
  'qwerty', 'qwertyuiop', 'qwertyuiopasdfghjkl', 'asdfghjkl', 'asdfghjklzxcvbnm', 'zxcvbnm', 'azerty', 'qazwsx', 'qazwsxedc',
  'admin', 'administrator', 'administrador', 'root', 'user', 'usuario', 'guest', 'default', 'teste', 'test', 'testing',
  'letmein', 'welcome', 'bemvindo', 'bemvinda', 'login', 'logon', 'hello', 'ola', 'secret', 'segredo', 'changeme', 'mudar', 'mudarsenha', 'trocar',
  'iloveyou', 'loveyou', 'teamo', 'tiamo', 'meuamor', 'amor', 'amorzinho', 'princess', 'princesa', 'dragon', 'monkey', 'shadow', 'sunshine',
  'master', 'superman', 'batman', 'starwars', 'matrix', 'pokemon', 'mustang', 'chocolate', 'cookie', 'banana', 'freedom', 'whatever', 'trustno',
  'football', 'futebol', 'baseball', 'basketball', 'flamengo', 'corinthians', 'palmeiras', 'santos', 'saopaulo', 'vasco', 'gremio', 'cruzeiro', 'botafogo',
  'brasil', 'brazil', 'brasileiro', 'familia', 'deus', 'jesus', 'jesuscristo', 'deusefiel', 'graca', 'bebe', 'gatinho', 'cachorro',
  'computador', 'internet', 'google', 'facebook', 'whatsapp', 'instagram', 'youtube', 'netflix', 'spotify',
  'michael', 'jennifer', 'jessica', 'jordan', 'hunter', 'ranger', 'tigger', 'charlie', 'andrew', 'thomas',
  'abcdef', 'abcdefgh', 'abcdefghij', 'abcdefghijkl', 'fuckyou', 'letmein',
  // This product's own name.
  'bli', 'businesslocation', 'businesslocationintelligence', 'locationintelligence', 'locateintelligence',
]);

// Keyboard runs that people type in order. A password that is a slice of one of
// these (or of its reverse) is rejected. Digit and alphabet runs, which wrap
// around (890123, xyzabc), are handled arithmetically by isCyclicRun below.
const SEQUENCE_SOURCES = [
  'qwertyuiopasdfghjklzxcvbnm',
  'qwertyuiop', 'asdfghjkl', 'zxcvbnm',
  'qazwsxedcrfvtgbyhnujmikolp',
  '1q2w3e4r5t6y7u8i9o0p',
  'q1w2e3r4t5y6u7i8o9p0',
  'zaq12wsxcde34rfv56tgb',
  '1qaz2wsx3edc4rfv5tgb',
  'a1b2c3d4e5f6g7h8i9j0',
];
const SEQUENCES = SEQUENCE_SOURCES.flatMap((source) => [source, [...source].reverse().join('')]);

const LEET = {
  0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', '@': 'a', $: 's', '!': 'i',
};

// Lower case, accents removed: "Sênha" and "senha" are the same to an attacker.
function fold(text) {
  return text.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

// Only letters and digits: what is left once separators and symbols are ignored.
function compact(text) {
  return fold(text).replace(/[^a-z0-9]/g, '');
}

// The words a password may be "made of" once decoration is undone. Two readings:
//   1. letters only:            "senha-1234"    -> "senha"
//   2. ends trimmed, then leet: "P@ssw0rd2024!" -> "password"
// (Applying leet to every digit would turn the "1234" in "senha1234" into
// letters and hide the word, which is why the ends are trimmed first.)
function baseWordCandidates(text) {
  const folded = fold(text);
  const lettersOnly = folded.replace(/[^a-z]/g, '');
  const unleeted = folded
    .replace(/^[^a-z]+|[^a-z]+$/g, '')
    .replace(/[0@$!13457]/g, (char) => LEET[char])
    .replace(/[^a-z]/g, '');
  return [lettersOnly, unleeted];
}

function isSequenceSlice(compacted) {
  return compacted.length >= 8 && SEQUENCES.some((sequence) => sequence.includes(compacted));
}

// "abcabcabcabc", "passwordpassword", "121212121212"
function isRepetition(compacted) {
  return compacted.length >= 8 && /^(.+?)\1+$/.test(compacted);
}

// "123456789012", "098765432109", "abcdefghijkl", "wxyzabcdefgh", "112233445566":
// every step is +1 (or every step is -1) over digits (mod 10) or letters (mod 26),
// after collapsing doubled characters.
function isCyclicRun(compacted) {
  const collapsed = compacted.replace(/(.)\1+/g, '$1');
  if (collapsed.length < 6) return false;

  const allDigits = /^[0-9]+$/.test(collapsed);
  const allLetters = /^[a-z]+$/.test(collapsed);
  if (!allDigits && !allLetters) return false;

  const base = allDigits ? 48 : 97; // '0' or 'a'
  const modulus = allDigits ? 10 : 26;
  const values = [...collapsed].map((char) => char.charCodeAt(0) - base);
  const steps = values.slice(1).map((value, index) => (value - values[index] + modulus) % modulus);
  return steps.every((step) => step === 1) || steps.every((step) => step === modulus - 1);
}

function isCommonPassword(password) {
  const compacted = compact(password);

  if (compacted.length === 0) return true; // only symbols/spaces
  if (new Set(compacted).size <= 3) return true; // "aaaaaaaaaaaa", "ababababab1"
  if (isSequenceSlice(compacted) || isRepetition(compacted) || isCyclicRun(compacted)) return true;

  return baseWordCandidates(password).some((word) => COMMON_BASE_WORDS.has(word));
}

module.exports = { isCommonPassword, compact };
