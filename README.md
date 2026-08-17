# Rust-Oleum Vendor Portal

SpecInsite Vendor Portal for Rust-Oleum Cleaners: signed per-vendor links, metrics dashboard, response flow, pre-built Excel download, bulk PDF/DOCX upload, admin ops, and SMS (Spec Management System) pull API.

**Production:** https://vendors.specinsite.com  
**Admin:** https://vendors.specinsite.com/admin.html  
**GitHub:** https://github.com/spec-collins/rust-oleum-vendor-portal  

Separate from Whole Foods Wave 1 (`respond.specinsite.com`). Separate Neon DB, Vercel project, and `LINK_SIGNING_SECRET`.

## Status

| Area | Status |
| --- | --- |
| Portal + signed gate + 4 response paths | Live |
| Metrics ingest → dashboard | Live |
| Per-vendor Excel download (named `{Vendor} template.xlsx`) | Live |
| Bulk PDF/DOCX upload | Live |
| Explainer video (9∶16) | Live |
| Admin (responses, ingest, Excel, uploads, video) | Live |
| Custom domain `vendors.specinsite.com` | Live |
| Signed links / mail merge | Deferred until VOR vendor list (week of Aug 24) |
| SMS pull API | See below / `api/sms-pull.js` |
| Harden / ops | This document |

## Stack

- Vercel (static `public/` + `api/` serverless)
- Neon Postgres
- Private Vercel Blob
- HMAC signed links (`vid` + `name` + `t`)

## Environment variables

| Name | Purpose |
| --- | --- |
| `DATABASE_URL` | Neon Postgres |
| `LINK_SIGNING_SECRET` | Vendor link HMAC — **never rotate after email** |
| `ADMIN_TOKEN` | Admin UI + admin APIs |
| `BLOB_READ_WRITE_TOKEN` | Private Blob read/write |
| `BASE_URL` | `https://vendors.specinsite.com` (mail-merge + scripts) |
| `SMS_PULL_TOKEN` | Spec Management System pull API (optional; falls back to `ADMIN_TOKEN`) |

Secrets live in Vercel env and local gitignored files only (`.env`, `GO_LIVE_SECRETS.local.md`).

## Local

```bash
cp .env.example .env
# fill values
npm install
npm run migrate
npm run dev
```

Signed preview (after secret is set):

```bash
npm run links -- vendors.csv
```

## Ops runbook

### Do not

- Rotate `LINK_SIGNING_SECRET` after vendor emails go out
- Reuse Whole Foods Neon DB, Vercel project, or signing secret
- Commit `.env*` or `*_SECRETS.local.md`

### Admin flows (`/admin.html`)

1. Save `ADMIN_TOKEN` in the browser session  
2. **Responses** — load tracker, CSV, mark assistance provided  
3. **Metrics** — ingest Cleaners dashboard one-pager `.xlsx`  
4. **Excel** — upload/replace/delete per-vendor template (or delete all)  
5. **Uploads** — list/download/zip vendor PDF/DOCX  
6. **Explainer video** — upload/replace/delete shared 9∶16 MP4  

### Mail merge links (when vendor list is final)

```bash
# vendors.csv: vendor_id,vendor_name
BASE_URL=https://vendors.specinsite.com npm run links -- vendors.csv > links.csv
```

### SMS pull (Spec Management System)

Auth header: `x-sms-token: <SMS_PULL_TOKEN>` (or `Authorization: Bearer …`, or `?token=`).

| Call | Purpose |
| --- | --- |
| `GET /api/sms-pull` | Vendors + upload counts |
| `GET /api/sms-pull?vendor_id=` | File metadata for one vendor (stable pathnames) |
| `GET /api/sms-pull?id=` or `?pathname=` | 302 to short-lived private download URL |

Pathnames: `uploads/{vendor_id}/{uuid}-{safeName}.{pdf\|docx}` — do not rename in Blob after upload.

## Go-live smoke checklist

- [ ] `GET https://vendors.specinsite.com/api/health` → `ok: true`  
- [ ] Admin loads with token; each section works  
- [ ] Signed vendor link opens portal (invalid `t` → access denied)  
- [ ] Dashboard tiles after ingest  
- [ ] Response path + 48h notice → due date after lock-in  
- [ ] Excel download filename = `{Vendor Name} template.xlsx`  
- [ ] PDF/DOCX upload appears in admin + SMS list  
- [ ] Explainer video plays when uploaded  
- [ ] `BASE_URL` in Vercel = `https://vendors.specinsite.com`  
- [ ] Secrets not in git (`git status` clean of `.env*`)  

## Copy-deploy (other clients)

Prefer the sanitized template repo **`specinsite-vendor-portal`** (when created): new Vercel project + new Neon + new secrets + optional hostname (`respond.specinsite.com` for Whole Foods, etc.). Do not share DBs or signing secrets across clients.

## Important

- Do **not** rotate `LINK_SIGNING_SECRET` after vendor emails go out.  
- Do **not** reuse the Whole Foods Neon database or Vercel project.  
- Long-term multi-tenant (`client_id` on `vendors.specinsite.com`) is a later architecture project; near-term = copy-deploy per client.
