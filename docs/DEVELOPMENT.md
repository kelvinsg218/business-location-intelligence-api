# Development guide

How to set up, run, test and extend the project on a development machine
(written for Windows/PowerShell; macOS and Linux differ only in how PostgreSQL
and Node are installed).

- [Prerequisites](#prerequisites)
- [Install PostgreSQL 18 (once)](#install-postgresql-18-once)
- [Create the role and databases (once)](#create-the-role-and-databases-once)
- [Configure and run](#configure-and-run)
- [Migrations](#migrations)
- [Tests](#tests)
- [Troubleshooting](#troubleshooting)
- [Adding a user-owned resource](#adding-a-user-owned-resource)
- [Dependency install scripts](#dependency-install-scripts)
- [Production notes](#production-notes)
- [Where things live](#where-things-live)

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 24 (LTS) or newer | `.nvmrc` says `24`; `engines` is `>=24`. `winget install OpenJS.NodeJS.LTS` |
| PostgreSQL | 18 | Native install. There is no Docker/Compose setup |
| npm | the one shipped with Node 24 | |

Check them:

```powershell
node --version        # v24.x
psql --version        # psql (PostgreSQL) 18.x   (the installer adds it to PATH; reopen the terminal)
```

## Install PostgreSQL 18 (once)

```powershell
winget install PostgreSQL.PostgreSQL.18
```

(or download the installer from <https://www.postgresql.org/download/windows/>).
The installer asks you to choose a **password for the `postgres` superuser** —
choose one and keep it: it is yours, this project never sees it or stores it, and
it is only used below for the one-time setup. Keep the default port `5432`; you
can skip Stack Builder. The installer starts PostgreSQL as a Windows service, so
it is running whenever the machine is.

## Create the role and databases (once)

The application never connects as `postgres`. It uses its own role, `bli`, and two
databases: `bli_dev` (the app) and `bli_test` (the automated tests). `npm run db:init`
creates them. It needs two values, which you provide **for that one command only**
(they are not written anywhere):

- `PGADMIN_URL` — how to connect as the superuser, with the password you chose at install time.
- `BLI_DB_PASSWORD` — a password **you choose now** for the new `bli` role (12+ characters). Do not reuse the superuser password.

```powershell
$env:PGADMIN_URL = "postgres://postgres:<superuser password>@localhost:5432/postgres"
$env:BLI_DB_PASSWORD = "<a password you choose for the bli role>"
npm run db:init
```

It is safe to run again (what exists is kept; the role's password is re-applied).
It ends by printing the two connection lines for your `.env`. Clear the variables
afterwards:

```powershell
Remove-Item Env:PGADMIN_URL, Env:BLI_DB_PASSWORD
```

> If the password contains characters such as `@`, `:`, `/` or `#`, URL-encode
> them in the connection strings (`@` → `%40`), or pick a password without them.

## Configure and run

```powershell
Copy-Item .env.example .env
```

Edit `.env`: replace `CHANGE_ME` in `DATABASE_URL` and `TEST_DATABASE_URL` with the
`bli` password from the previous step. Everything else can stay as it is for local
development (`SESSION_COOKIE_SECURE=false` is already set: on plain
`http://localhost` a `Secure` cookie could not be delivered). Then:

```powershell
npm install
npm run db:migrate          # creates the tables in bli_dev
npm run dev                 # backend on http://localhost:3000
```

In a second terminal:

```powershell
cd frontend
npm install
npm run dev                 # frontend on http://localhost:5173
```

Open <http://localhost:5173>, choose **Criar conta**, register, and you are in.
The first analysis uses the mock providers (no Google calls, no cost).

How the two servers talk: the browser only ever calls `http://localhost:5173/api/...`.
The Vite dev server forwards `/api` (including `/api-docs`, the Swagger UI) to the
backend (`vite.config.js`). Because the API is therefore same-origin, the
`HttpOnly`, `SameSite=Strict` session cookie works and no CORS is needed. If the
backend listens on another port, set `DEV_API_PROXY_TARGET` (for example in
`frontend/.env`). Do **not** set `VITE_API_BASE_URL` to `http://localhost:3000`: the
browser would then call the API cross-origin and sign-in would break.

Sanity checks:

```powershell
curl http://localhost:3000/health    # {"status":"ok"}            process alive
curl http://localhost:3000/ready     # {"status":"ready",...}     PostgreSQL answers
```

## Migrations

SQL files under `db/migrations`, applied in name order by
[`node-pg-migrate`](https://salsita.github.io/node-pg-migrate/). Applied migrations are
recorded in the `pgmigrations` table; the runner takes a lock and applies all pending
ones in a single transaction.

```powershell
npm run db:migrate                           # apply pending migrations to DATABASE_URL
npm run db:migrate:test                      # the same for TEST_DATABASE_URL
npm run db:migrate:create -- add-something   # new file with the up/down template
```

A migration file has two sections:

```sql
-- Up Migration
CREATE TABLE ...;

-- Down Migration
DROP TABLE ...;
```

Rules:

1. **Never edit a migration that has already been applied anywhere** (yours, CI, production). Add a new one.
2. Write plain SQL and keep it re-runnable through the runner, not by hand: the CI applies the whole set twice and requires the second run to say `No migrations to run!`.
3. Constraints belong in the database, not only in the code (`CHECK`, `UNIQUE`, `NOT NULL`, foreign keys with an explicit `ON DELETE`).
4. Ownership: any table that holds user data carries `user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE` and an index on it (see below).

Current schema (v0.3.0): `users` (uuid id, normalized unique e-mail, name, Argon2id hash,
timestamps, format checks) and `sessions` (SHA-256 of the session id as key, `user_id`
with `ON DELETE CASCADE`, JSONB data, `created_at`, `last_seen_at`, `expires_at`,
`absolute_expires_at`). Nothing else: no projects, analyses, demographics or reports yet.

## Tests

```powershell
npm test                 # everything; needs PostgreSQL and TEST_DATABASE_URL
npm run test:unit        # only what needs no database
npm run lint
cd frontend; npm test; npm run lint; npm run build
```

- `tests/unit`, `tests/integration`: no database (the app is wired to mocks/stubs; `tests/helpers/testAuth.js` stands in for the auth module when a test is about something else).
- `tests/db`: a real PostgreSQL. `TEST_DATABASE_URL` **must** point to a database whose name ends in `_test`; the helpers refuse to run otherwise. `npm test` applies the migrations to it first.
- The database suites are **parallel-safe**: each test uses data that is unique to it (random e-mails), never truncates a table and never counts a whole table. Follow the same rules in new tests: scope every query to the rows the test created, and clean up with `deleteUsers` (the foreign key cascades to the sessions).
- Time-based behaviour (session expiry) is tested with an injected clock (`tests/helpers/authApp.js`), never with real waiting.
- `npx jest --detectOpenHandles` should report nothing: every pool a test opens is closed.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Server exits with `DATABASE_URL is required` | Set it in `.env` (see above) |
| `password authentication failed for user "bli"` | The password in `.env` is not the one given to `db:init`. Run `db:init` again with the password you want; it re-applies it |
| `ECONNREFUSED` / `/ready` is `503` | PostgreSQL is not running (start the *postgresql-x64-18* Windows service) or the port in the URL is wrong |
| `Refusing to run database tests against "…"` | `TEST_DATABASE_URL` does not point to a `*_test` database |
| `TEST_DATABASE_URL is not set` | Set it in `.env`, or run `npm run test:unit` |
| Register/login answers `403 FORBIDDEN_ORIGIN` | The page's origin is not in `ALLOWED_ORIGINS`. In development that is `http://localhost:5173` and `http://127.0.0.1:5173` by default; if you use another host or port, add it |
| Signed in, but the next request is `401` | The cookie was not stored. In development make sure `SESSION_COOKIE_SECURE=false`; behind HTTPS in production the app must see the request as secure (`TRUST_PROXY`) |
| The browser calls `http://localhost:3000` directly and fails | A leftover `VITE_API_BASE_URL` in `frontend/.env`; remove it |
| `[nodemon] clean exit` right after startup | Something already holds port 3000; see the README's troubleshooting section |
| `429` on register/login | The in-memory rate limits; wait, or restart the backend in development |

## Adding a user-owned resource

There are none yet (v0.3.0 has only `users` and `sessions`), but the first one
(projects, candidate locations, analyses, ...) must follow these rules. They are enforced
by tests, not by good intentions.

1. **The table** has `user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE` and an index starting with `user_id`.
2. **The repository** (`src/modules/<name>/<name>.repository.js`, exporting `create<Name>Repository(db)`) has functions whose **first parameter is `userId`**, and every SQL statement filters or inserts by it: `SELECT ... WHERE user_id = $1 AND id = $2`. Never fetch by `id` alone and check the owner afterwards.
3. **The user comes from `req.auth.userId`** (set by `requireAuth` from the server-side session) — never from the body, the query string, the URL or a header. `req.auth` is assigned in exactly one place.
4. **Someone else's resource is a `404`**, never a `403`, and the body is identical to the one for an id that does not exist, so ids cannot be probed.
5. **Google content** (places, names, addresses, coordinates) must not be stored beyond what Google's terms allow (see the README).

How the rules are checked:

- `tests/unit/architecture/repositories.test.js` discovers every `*.repository.js` under `src/modules` (except the `users` repository, the only one that is not scoped by a user) and fails unless each function takes `userId` first and every query it sends mentions `user_id` bound to that argument. If a method needs realistic arguments to reach its SQL, add them to `SAMPLES` in that file. It also scans the sources: `userId` is never read from `req.body/query/params/headers`, and `req.auth =` appears only in `requireAuth.js`.
- `tests/helpers/tenants.js` provides `assertOwnedResourceIsolation({ send, existingPath, missingPath, ownerCookie, intruderCookie })` for the route tests: the owner gets `200`, another user gets the same `404` as for a missing id, an anonymous caller gets `401`. Use it with two accounts created through the real auth flow (`tests/helpers/authApp.js`).
- Every route of the new resource sits behind `requireAuth` (the locations router shows how: `router.use(requireAuth)`).

## Dependency install scripts

npm can run scripts when a dependency is installed (`preinstall`, `install`, `postinstall`).
They are a supply-chain risk, and npm 12 will deny them by default. Both `package.json`
files record a decision per package in `allowScripts`. In this version **every one is
denied**, and `npm ci --ignore-scripts` (what a hardened CI would use) gives a fully
working install: the test suites, lint and build pass in a clean checkout installed that way.

| Package | Pulled in by | Script | Decision and why |
|---|---|---|---|
| `@scarf/scarf` | `swagger-ui-dist` (runtime) | `postinstall: node ./report.js` | **Denied.** It is usage telemetry: it reports the install to a third party. Nothing depends on it |
| `argon2` | the application (runtime) | `install: node-gyp-build` | **Denied.** The package ships prebuilt binaries — Windows x64, macOS on Apple silicon, Linux x64 / arm / arm64 (glibc and musl) and FreeBSD — that it loads without running anything. On any other platform (for example Intel macOS or Windows on ARM) the app fails at startup with "No native build was found": then approve this one script (`npm install-scripts approve argon2`) and install a C++ toolchain so it can build from source |
| `unrs-resolver` | `jest` (dev) | `postinstall` | **Denied.** Fallback downloader for a native binding npm already installs as an optional dependency |
| `@parcel/watcher` | `jest` (dev) | `install: build-from-source` | **Denied.** Only builds from source when explicitly asked to (`npm_config_build_from_source`); otherwise a no-op |
| `esbuild` (frontend) | `vite`, `vitest` (dev) | `postinstall: node install.js` | **Denied.** It only validates the binary that npm already installed from its optional platform package |

Review after adding or updating dependencies: `npm install-scripts ls` (run in the root and
in `frontend/`) lists packages with scripts that no `allowScripts` entry covers. Approve
only what is provably needed, and write down why here.

## Production notes

Not part of this version's scope (no deployment is set up), but the server is built for it:

- **Required:** `NODE_ENV=production`, `DATABASE_URL`, `SESSION_SECRET` (≥ 32 random characters; several, comma separated, for rotation), `ALLOWED_ORIGINS` (the public origin, e.g. `https://app.example.com`), and `SESSION_COOKIE_SECURE=true` (the default). The process refuses to start if any of these is missing or weak.
- **HTTPS is mandatory.** The cookie is `Secure` and `__Host-`-prefixed, which browsers only accept over HTTPS. Behind a TLS-terminating proxy set `TRUST_PROXY` to the exact number of proxies so the app sees the request as secure and gets the real client address for the rate limits.
- **Single origin.** Serve the front end and the API from one origin (the app does not serve the built front end yet; a reverse proxy can). Keep `CORS_ORIGINS` empty.
- **Migrations** run as a deploy step (`npm run db:migrate`) before the new version starts; take a backup first. The rate limits and the pruning timer are per process, so several instances would need a shared rate-limit store.
- **Graceful shutdown:** on `SIGTERM` the server stops accepting connections, lets in-flight requests finish, then closes the database pool.
- **Probes:** `/health` (liveness, never touches the database) and `/ready` (readiness, checks PostgreSQL); neither is rate limited.

## Where things live

```
db/migrations/                 versioned SQL (users, sessions)
scripts/db-init.js             one-time role + database creation
scripts/wait-for-db.js         waits until PostgreSQL answers (used by CI)
src/db/                        pool, readiness ping, "database unavailable" detection
src/modules/users/             users repository, e-mail normalization
src/modules/auth/              password (Argon2id), PgSessionStore, session middleware,
                               origin guard, rate limits, service/controller/routes, requireAuth
src/middlewares/               error handler (maps body/DB errors), JSON-only body parsing,
                               global rate limiter, request id
tests/helpers/                 test database pool, in-memory clock app builder, tenant checks
frontend/src/api/              the single fetch client (credentials: 'include', same origin)
frontend/src/auth/             AuthProvider, RequireAuth, PublicOnly, pt-BR messages
```
