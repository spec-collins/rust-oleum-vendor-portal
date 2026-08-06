# Rust-Oleum Vendor Portal

SpecInsite-branded vendor portal for Rust-Oleum: signed per-vendor links, metrics dashboard, response flow, pre-built Excel download, and bulk PDF/DOCX upload.

**Separate product from the Whole Foods response tool.** New repo, new Neon DB, new Vercel project, new signing secret.

## Phase status

| Phase | Status |
| --- | --- |
| 1. Portal shell + signed gate + response scaffold | In progress / scaffolded |
| 2. Metrics Excel ingest → DB → 5 tiles | Next |
| 3. Pre-built Excel download | Planned |
| 4. Bulk PDF/DOCX direct upload | Planned (500 files / 25 MB each) |
| 5. Harden + ops handoff | Planned |

## Stack

- Vercel (static `public/` + `api/` serverless)
- Neon Postgres
- HMAC signed links (`vid` + `t`)
- SpecInsite visual language (Apple–SpaceX aesthetic)

## Local

```bash
cp .env.example .env
# set DATABASE_URL, LINK_SIGNING_SECRET, ADMIN_TOKEN, BASE_URL
npm install
npm run migrate
npm run dev
```

Open a signed link (after `npm run links -- vendors.csv`), or for local UI-only preview without signing:

```
http://localhost:3000/?vid=DEMO&name=Demo%20Vendor
```

(If `LINK_SIGNING_SECRET` is set, `t=` is required.)

## Metrics ingest (Phase 2 plan)

You provide one clean worksheet with one row per `vendor_id` and five metric columns. Admin ingest upserts `vendor_metrics`; the portal reads the snapshot — it does not open the Excel file on each page load.

## Important

- Do **not** rotate `LINK_SIGNING_SECRET` after vendor emails go out.
- Do **not** reuse the Whole Foods Neon database or Vercel project.
