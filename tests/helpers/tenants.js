'use strict';

// Tooling for the ownership rules every user-owned resource must follow. There
// are no such resources yet (v0.3.0 only has users and sessions); the day the
// first one is added, its repository and routes are checked with these helpers
// (see docs/DEVELOPMENT.md, "Adding a user-owned resource").
//
// The rules:
//  1. A repository function takes `userId` as its FIRST parameter.
//  2. Every SQL statement it runs filters (or inserts) by `user_id`, with the
//     value bound from that parameter: WHERE user_id = $1 AND ...
//  3. `userId` comes from `req.auth` (the server-side session), never from the
//     body, the query string, the URL or a header.
//  4. Another user's resource is answered exactly like a missing one: 404,
//     never 403, so ids can not be probed.

const TENANT_ID = '00000000-0000-4000-8000-0000000000aa';

// Everything a repository sends to the database, recorded; nothing is executed.
function recordingDb() {
  const calls = [];
  const query = async (text, params = []) => {
    calls.push({ text, params });
    return { rows: [], rowCount: 0 };
  };
  return {
    calls,
    query,
    // repositories that use transactions check a client out of the pool
    connect: async () => ({ query, release() {} }),
  };
}

// The first declared parameter of a function, as source text (whitespace
// collapsed: Jest's transform reprints the code, so line breaks are not stable).
function firstParameter(fn) {
  const source = Function.prototype.toString.call(fn).replace(/^\s*async\s+/, '');
  const bare = source.match(/^([A-Za-z_$][\w$]*)\s*=>/); // `x => ...`, no parentheses
  if (bare) return bare[1];

  let depth = 0;
  let param = '';
  for (let i = source.indexOf('(') + 1; i < source.length; i += 1) {
    const ch = source[i];
    if ('([{'.includes(ch)) depth += 1;
    else if (')]}'.includes(ch)) {
      if (depth === 0) break;
      depth -= 1;
    } else if (ch === ',' && depth === 0) break;
    param += ch;
  }
  return param.replace(/\s+/g, ' ').trim();
}

const CONTROL_STATEMENT = /^\s*(BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE|SET\s+LOCAL)\b/i;

function scopedQueryProblem({ text, params }) {
  if (typeof text !== 'string') return 'the SQL is not a plain string';
  if (CONTROL_STATEMENT.test(text)) return null;
  if (!/\buser_id\b/i.test(text)) return `does not mention user_id: ${text.trim().slice(0, 80)}`;
  if (!params.includes(TENANT_ID)) return `does not bind the userId argument: ${text.trim().slice(0, 80)}`;

  if (/^\s*INSERT\b/i.test(text)) return null;

  // SELECT / UPDATE / DELETE: user_id = $N where $N is bound to the userId.
  const filters = [...text.matchAll(/\buser_id\s*=\s*\$(\d+)/gi)];
  if (filters.length === 0) return `has no "user_id = $n" filter: ${text.trim().slice(0, 80)}`;
  const bound = filters.some((match) => params[Number(match[1]) - 1] === TENANT_ID);
  return bound ? null : `filters user_id with a placeholder that is not the userId: ${text.trim().slice(0, 80)}`;
}

/**
 * Checks a repository factory against rules 1 and 2.
 *
 * @param {Function} createRepository  (db) => repository object
 * @param {object} [samples]  method name -> extra arguments to call it with
 *   (after userId), for methods that need real-looking input to reach their SQL
 * @returns {Promise<string[]>} violations; empty when the repository follows the rules
 */
async function findRepositoryViolations(createRepository, samples = {}) {
  const violations = [];
  const db = recordingDb();
  const repository = createRepository(db);
  const methods = Object.entries(repository).filter(([, value]) => typeof value === 'function');

  if (methods.length === 0) return ['exports no functions'];

  for (const [name, fn] of methods) {
    if (!/^userId\b/.test(firstParameter(fn))) {
      violations.push(`${name}(): the first parameter must be userId (found "${firstParameter(fn) || '<none>'}")`);
    } else {
      db.calls.length = 0;
      try {
        await fn(TENANT_ID, ...(samples[name] || []));
      } catch {
        // a method may reject an empty fake result; only the SQL it sent matters
      }
      if (db.calls.length === 0) {
        violations.push(`${name}(): ran no SQL (give it "samples" that reach the database)`);
      }
      db.calls.forEach((call) => {
        const problem = scopedQueryProblem(call);
        if (problem) violations.push(`${name}(): ${problem}`);
      });
    }
  }
  return violations;
}

const withoutRequestId = (body) => {
  const copy = JSON.parse(JSON.stringify(body));
  if (copy && copy.error) delete copy.error.requestId;
  return copy;
};

/**
 * Rule 4 over HTTP. `send(cookie, path)` performs the request as that user
 * (cookie undefined = anonymous) and resolves to a supertest response.
 *
 * Throws (via expect) unless: the owner gets 200; another user gets the SAME
 * 404 an id that does not exist gets; an anonymous caller gets 401.
 */
async function assertOwnedResourceIsolation({
  send, existingPath, missingPath, ownerCookie, intruderCookie,
}) {
  const owner = await send(ownerCookie, existingPath);
  const intruder = await send(intruderCookie, existingPath);
  const missing = await send(ownerCookie, missingPath);
  const anonymous = await send(undefined, existingPath);

  expect(owner.status).toBe(200);
  expect(intruder.status).toBe(404);
  expect(missing.status).toBe(404);
  expect(withoutRequestId(intruder.body)).toEqual(withoutRequestId(missing.body));
  expect(anonymous.status).toBe(401);
}

module.exports = {
  TENANT_ID,
  assertOwnedResourceIsolation,
  findRepositoryViolations,
  firstParameter,
  recordingDb,
};
