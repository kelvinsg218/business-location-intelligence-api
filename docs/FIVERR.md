# Fiverr Gig Material

Internal working notes for launching a Fiverr Gig, using this project as
the flagship portfolio piece. Nothing here is published automatically —
copy/adapt into Fiverr's own gig editor by hand, and double-check every
category/subcategory name against Fiverr's current UI before publishing,
since categories change and aren't verified here.

## 1. Gig Title

**I will build a custom REST API or API integration with Node.js**

## 2. Category / Subcategory (verify on Fiverr before publishing)

Suggested direction: **Programming & Tech → Backend Development** (or the
closest current equivalent). Fiverr's exact category tree isn't something
that can be confirmed from this repository — check the live options in the
Fiverr Seller dashboard when creating the Gig, rather than trusting this
suggestion blindly.

## 3. Search Tags

`Node.js`, `REST API`, `API integration`, `Express.js`, `backend`

## 4. Gig Description

> I build custom REST APIs and backend integrations using Node.js and
> Express.
>
> This includes:
> - Designing and building REST APIs from scratch
> - Integrating third-party/external APIs into your existing system
> - Backend business logic and data processing
> - Database integration
> - Authentication (when needed)
> - Clear API documentation (Swagger/OpenAPI or written docs)
> - Input validation and structured error handling
> - Deployment, when included in the agreed scope
>
> I work with clear requirements, ask clarifying questions up front, and
> deliver documented, tested code — not a black box.
>
> Third-party API fees, hosting, databases, domains and other external
> service costs are not included in the Gig price unless explicitly agreed
> beforehand. See the FAQ below.

(Deliberately avoids "expert", "senior", or a specific years-of-experience
claim — see [Portfolio vs. Client Project](#portfolio-vs-client-project) below
for why overstated claims are avoided throughout this material.)

## 5. Packages

Scopes and prices below are **starting-point suggestions**, not researched
market averages — adjust based on actual demand and comfort level before
publishing.

### BASIC — Simple API

- Scope: a single-resource REST API (e.g. 2–4 endpoints) with input
  validation and structured error responses.
- Integration: none, or one simple external API call.
- Database: none, or a simple in-memory/JSON store.
- Auth: none.
- Docs: a README with setup + endpoint list.
- Suggested timeline: 3–5 days.
- Suggested revisions: 1.
- Suggested starting price: **$80–150** (placeholder — not a market average).

### STANDARD — Business API

- Scope: a multi-resource REST API (e.g. 5–10 endpoints) with validation,
  structured errors, and rate limiting.
- Integration: one external API integrated end to end (e.g. payments,
  maps, email, a data provider).
- Database: a real database (Postgres/MySQL/MongoDB) with basic
  schema/migrations.
- Auth: simple token/API-key auth if needed.
- Docs: Swagger/OpenAPI + README.
- Suggested timeline: 7–12 days.
- Suggested revisions: 2.
- Suggested starting price: **$250–500** (placeholder — not a market average).

### PREMIUM — Custom Integration

- Scope: a larger REST API or a backend built to sit behind/integrate with
  an existing frontend or system, following the client's own requirements.
- Integration: one or more external APIs, more complex business logic.
- Database: full schema design, relationships, migrations.
- Auth: full authentication/authorization if needed.
- Docs: Swagger/OpenAPI, README, and a short architecture write-up.
- Suggested timeline: agreed per scope (typically 2–4 weeks).
- Suggested revisions: agreed per scope.
- Suggested starting price: **from $600**, scoped individually (placeholder — not a market average).

All three packages exclude deployment and external service costs by
default — see [Deployment Policy](#8-deployment-policy) and
[External Costs](#external-costs).

## 6. Buyer Requirements

Questions to ask every buyer before starting:

1. What should the API do?
2. Do you have documentation for the external API (if any)?
3. Do you already have API credentials?
4. What data should be sent and returned?
5. Do you need a database?
6. Do you need authentication?
7. Do you have an existing codebase this needs to fit into?
8. Which technologies does your current system use?
9. Do you need deployment?
10. Where do you want the application deployed?

## 7. FAQ

**Are third-party API fees included?**
No. Third-party API usage fees, hosting, paid services, subscriptions,
domains and other external platform costs are not included unless
explicitly agreed.

**Do you provide source code?**
Yes — full source code, delivered as described in
[Delivery Model](#delivery-model) below.

**Can you integrate with an existing system?**
Yes, if you can share enough context (codebase access or a clear
description, plus documentation for anything it needs to talk to).

**Do you provide API documentation?**
Yes — Swagger/OpenAPI and/or a written README, depending on the package.

**Can you fix an existing API?**
Yes, on a case-by-case basis — share the repo/access and a description of
the issue first so the scope can be estimated properly.

**Do you deploy the API?**
Only when deployment is explicitly included in the order — see
[Deployment Policy](#8-deployment-policy).

**Who pays for hosting?**
The client, normally in their own account — see [External Costs](#external-costs).

**Who provides external API credentials?**
The client, for any third-party service the integration needs (payment
provider, maps, email, etc.) — see [External Costs](#external-costs).

## 8. Deployment Policy

- Deployment is **not included by default** unless explicitly included in
  the package/order.
- When agreed, deployment is performed **in the client's own
  hosting/cloud environment** — not a personal account of the developer's.
- Infrastructure and any recurring external costs normally belong to the
  client (see below).

## 9. Portfolio Case: Business Location Intelligence API

The Business Location Intelligence API (this repository) is the flagship
example used in the Gig portfolio. It demonstrates, concretely:

- Node.js + Express REST API design
- External API integration (Google Geocoding + Places APIs), including a
  mock/real provider abstraction for cost-safe development
- Geospatial processing (grid search, deduplication, distance filtering)
- React frontend integration consuming the API end to end
- Automated testing (Jest + Vitest) and Swagger/OpenAPI documentation

It is shown as a **portfolio/demonstration project** — not as a
commercial product, not as something every buyer receives a copy of. See
[Portfolio vs. Client Project](#portfolio-vs-client-project) below.
Full write-up: [`docs/CASE_STUDY.md`](./CASE_STUDY.md).

---

## Portfolio vs. Client Project

**Important distinction to keep in any Gig copy or buyer conversation:**
this repository is a **portfolio project**, built to demonstrate ability —
not a template that every client receives a copy of.

**Portfolio Project** (this repository) demonstrates capability in:
- REST API design
- Node.js / Express
- External API integrations
- Geospatial data processing
- React frontend integration
- Input validation and error handling
- Automated testing
- Swagger/OpenAPI documentation
- Provider-abstraction architecture (mock vs. real)

**Client Project** (what an actual buyer receives) is scoped to their own
requirements and typically looks nothing like this repository beyond
sharing an engineering approach. Examples of what a client engagement
might actually involve:
- A custom REST API for their own domain
- Integrating a specific third-party API they already use
- A backend built behind an existing frontend they already have
- Database integration for their existing system
- Automation of a manual backend process
- Integrating an external service (payments, email, maps, etc.)
- Authentication for their application
- Deployment, when contracted separately

No buyer should be led to believe they're getting "the Business Location
Intelligence API" — they're getting a solution built for their own
requirements, using the same engineering standards this project
demonstrates.

## Delivery Model

**Code Delivery** (the default, included in all packages):
- Source code
- README
- `.env.example`
- API documentation (Swagger/OpenAPI and/or written docs)
- Tests
- Installation instructions

**Deployment Delivery** (only when contracted separately):
- Configuration in the client's own environment
- Environment variables setup
- Backend application deployment
- Database configuration, when applicable
- Actual deployment
- HTTPS/domain/reverse proxy setup, when explicitly part of the agreed scope

Hosting is never assumed to be included, and hosting is never paid for by
the developer on the client's behalf.

## External Costs

Stated plainly to every buyer, ideally in the Gig description and FAQ:

> Third-party API fees, hosting costs, domains, databases, cloud services,
> paid subscriptions and other external service costs are not included
> unless explicitly agreed.

Wherever possible, infrastructure should belong to the client, in the
client's own account:

| Service | Belongs to |
|---|---|
| Google Cloud / other cloud API usage | Client's account |
| AWS / Azure / GCP hosting | Client's account |
| Hosting / VPS | Client's account |
| Domain | Client's account |
| Database service | Client's account |
| Payment provider (Stripe, etc.) | Client's account |

Work may include **configuring and integrating** these services on the
client's behalf when that's part of the agreed scope — but the accounts,
billing, and ongoing costs belong to the client. Client credentials are
never committed to any repository, shared, or stored outside of what the
engagement requires.
