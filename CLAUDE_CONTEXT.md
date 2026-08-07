# Rust-Oleum Vendor Portal — Context for Claude

**Repo:** `C:\Users\david\Desktop\rust-oleum-vendor-portal`  
**GitHub:** https://github.com/spec-collins/rust-oleum-vendor-portal  
**Production:** https://rust-oleum-vendor-portal.vercel.app  
**Admin:** https://rust-oleum-vendor-portal.vercel.app/admin.html  

This is a **new SpecInsite product**, separate from the Whole Foods response tool. Separate repo, Neon DB, Vercel project, and `LINK_SIGNING_SECRET`. Do not reuse Whole Foods infra.

`README.md` in this repo is **stale** on phase status. Prefer this file.

Secrets live only in local gitignored files (`GO_LIVE_SECRETS.local.md`, `.env` / `.env.local`) and Vercel env. **Do not commit or paste secrets into chat.** Env var names: `DATABASE_URL`, `LINK_SIGNING_SECRET`, `ADMIN_TOKEN`, `BLOB_READ_WRITE_TOKEN`, `BASE_URL`.

---

## Product goal

Give each Rust-Oleum Cleaners vendor a signed link to:

1. See their **estimated specs** metrics (from a one-pager Excel snapshot in Postgres).
2. Choose how they will provide data.
3. Download a **pre-built per-vendor Excel** (not generated on the fly).
4. Upload many **PDF/DOCX** files into private Blob storage under their `vendor_id`.

Ops uses `/admin.html` with `ADMIN_TOKEN` for ingest, Excel templates, upload review, and response follow-up.

---

## Locked decisions

| Topic | Decision |
| --- | --- |
| Auth | HMAC signed links: `?vid=&name=&t=` — do **not** rotate `LINK_SIGNING_SECRET` after email |
| Metrics | Excel one-pager → ingest → DB snapshot; portal never reads Excel live |
| Excel download | Pre-built file per vendor in private Vercel Blob; admin uploads/replaces |
| Uploads | Direct-to-Blob; max **500 files/vendor**, **25 MB** each; **PDF + DOCX** only |
| `vendor_id` | Slug derived from vendor name |
| Scope copy | Cleaners Division — Estimated Specs; italic: *Spec is defined as the Drawing or the Die Line.* |
| UI copy | Prefer “Packaging Type” over “Record Type” |
| Aesthetic | SpecInsite “Apple–SpaceX”: Space Grotesk + DM Sans, cool gray surfaces, muted action colors |
| Division | Cleaners only; ignore Excel rows without a vendor |
| Blob store | Private store `rust-oleum-vendor-files` |
| Vercel plan | Pro (was Hobby; hit 12-function limit, then consolidated routes; now on Pro) |

---

## Stack

- Static HTML: `public/index.html` (vendor), `public/admin.html` (ops)
- Vercel serverless: `api/*.js`
- Neon Postgres (`cold-dust-37892642`)
- `@vercel/blob` private storage
- Node ≥ 20, ESM (`"type": "module"`)
- Sheet parsing: `xlsx`

### Useful npm scripts

```bash
npm run migrate          # apply lib/schema.sql
npm run ingest -- <xlsx> # CLI metrics ingest
npm run links -- vendors.csv   # signed mail-merge URLs → stdout CSV
npm run dev
npm test
```

---

## What is built (done)

### 1. Portal shell + signed gate

- Vendor opens personalized URL; `t` verified with HMAC (`lib/signing.js`, `lib/vendor-auth.js`).
- Header shows vendor name, then “Cleaners Division — Estimated Specs”, then italic definition line.
- Three-column layout: metrics | response | files.

### 2. Metrics dashboard

- Source workbook (local reference):  
  `C:\Users\david\Desktop\Rust-Oleum\Vendor Portal Build\Rust-Oleum_Cleaners_Vendor_Dashboard_Data.xlsx`  
  Sheet: `Vendor Dashboard Data` (~50 vendors).
- Admin or `npm run ingest` upserts `vendor_metrics` (JSON dashboard snapshot + rank).
- Left panel: estimated specs, by packaging type, SAP, weight %, material %, EPR ready.

### 3. Vendor response flow

Codes: `spreadsheet` | `upload_docs` | `specright` | `assisted`

- Spreadsheet / Upload / SpecRight → timeframe: `this_week` (+7d) / `next_two_weeks` (+14d) / custom date (“need more time”).
- Assisted → instruct reply-to-email for 15‑min call; stores `reply_to_email`; admin treats as **Urgent**.
- Reset selection clears choice (including after refresh).
- First-step lede (“Choose one path…”) **hidden** on secondary screens.

### 4. Pre-built Excel download (plumbing ready; real files still needed)

- Blob path pattern: `downloads/{vendor_id}/template.xlsx` (`lib/download-paths.js`).
- Registry: `vendor_download_files`.
- Admin upload/replace via `api/admin-excel.js` + admin UI (`allowOverwrite: true`).
- Admin delete one / delete all via `DELETE /api/admin-downloads?vendor_id=` or `?all=1` (Blob + DB).
- Vendor download via signed `api/download.js`.
- Seed helpers exist (`scripts/seed-test-excels.mjs`) for placeholders — **not** production templates.

### 5. Bulk PDF/DOCX upload

- Path: `uploads/{vendor_id}/{uuid}-{safeName}.ext` (`lib/upload-paths.js`) — **stable for future SMS pull**.
- Presign/complete via `api/upload.js`; registry `vendor_uploads`.
- Vendor multi-select UI; “Upload Files” button (muted dark green); “Download Excel” (muted steel blue).
- Admin list + per-file download + browser zip-by-vendor (`api/admin-uploads.js`).

### 6. Admin ops page

Sections:

1. Vendor responses — follow-up dates, Urgent for assistance, mark assistance provided, CSV export  
2. Metrics ingest  
3. Vendor Excel template upload  
4. PDF/DOCX uploads  

Follow-up logic: `lib/follow-up.js`. Assistance uses `admin_status` on `vendor_responses`.

### 7. Schema (`lib/schema.sql`)

- `vendor_responses` + `response_events`
- `vendor_metrics`
- `vendor_download_files`
- `vendor_uploads`

### 8. UI polish already shipped

- Spec definition under vendor name (two lines).
- Response lede only on choice step.
- Download / Upload button muted brand colors; upload CTA label **Upload Files**.

---

## Key file map

| Area | Paths |
| --- | --- |
| Schema | `lib/schema.sql` |
| Signing / auth | `lib/signing.js`, `lib/vendor-auth.js`, `lib/admin-auth.js`, `lib/vendor-id.js` |
| Limits | `lib/limits.js` |
| Portal APIs | `api/portal.js`, `api/respond.js`, `api/download.js`, `api/upload.js`, `api/health.js` |
| Admin APIs | `api/admin-ingest.js`, `api/admin-excel.js`, `api/admin-downloads.js`, `api/admin-uploads.js`, `api/admin-responses.js` |
| Metrics parse | `lib/dashboard-xlsx.js`, `lib/ingest-dashboard.js` |
| Blob paths | `lib/download-paths.js`, `lib/upload-paths.js`, `lib/presign-get.js` |
| UI | `public/index.html`, `public/admin.html` |
| Mail-merge links | `scripts/make-links.mjs` |
| Config | `package.json`, `vercel.json` |

---

## What we have yet to build / finish

Work queue when David returns (in this order unless he says otherwise):

### Explainer video (shared)

- Leftmost portal column: 9∶16 “How it works” panel.
- One global MP4 in private Blob (`assets/explainer.mp4`), registry `portal_media`.
- Admin section 5: upload / replace / delete (`api/admin-video.js`).
- Vendor playback via signed redirect `api/video.js?vid=&t=`.

### (2) Real Excel templates

- Produce/upload **real** per-vendor `.xlsx` workbooks for pilots (and then all vendors).
- Use admin Excel upload (or scripted upload) into `downloads/{vendor_id}/template.xlsx`.
- Verify each pilot vendor link shows **Download Excel** enabled and file is correct.
- Placeholder/seed files are not enough for go-live.

### (3) Signed links for mail merge

- Pipeline already exists: `npm run links -- vendors.csv` with `BASE_URL` + `LINK_SIGNING_SECRET`.
- CSV in: `vendor_id`, optional `vendor_name` / `name`.
- CSV out: `vendor_id,vendor_name,link`.
- Remaining work: finalize vendor list CSV, generate production links, hand to email/mail-merge; confirm `name` encoding; smoke-test a sample of links.
- Reminder: never rotate signing secret after send.

### (4) Harden / ops handoff

- Refresh `README.md` to match reality (phases, env, runbooks).
- Production checklist: migrate, ingest metrics, upload templates, health check, admin token access, smoke signed link.
- Rate limits / abuse notes, backup awareness, who owns Neon/Vercel/Blob.
- Document admin workflows (ingest, Excel replace, zip uploads, assistance status).
- Confirm logging/error paths are ops-friendly.
- Any remaining security headers / env hygiene (no secrets in repo).

### (5) SMS pull API

- “SMS” here means **Spec Management System** pull of vendor-uploaded files (not text messaging).
- Upload pathnames are already designed to be stable: `uploads/{vendor_id}/…`.
- Admin list-by-vendor already returns SMS-friendly metadata (`api/admin-uploads.js` GET `?vendor_id=`).
- Remaining: a **stable, documented pull API** (auth model, pagination, pathname immutability guarantees, download URLs or redirects) that Spec Management can call without depending on the admin HTML UI.
- Prefer extending/clarifying existing upload registry + path helpers rather than inventing a second storage layout.

---

## Working conventions

- Prefer small, focused diffs; match existing SpecInsite visual language.
- Do not invent a second auth system; keep HMAC `vid` + `t` for vendors and `ADMIN_TOKEN` for ops.
- Do not generate Excel on each download request — keep pre-built Blob files.
- After code changes intended for prod: commit on `main`, push, `vercel --prod` (David’s usual flow).
- Only commit when David asks; never commit `GO_LIVE_SECRETS.local.md` or `.env*`.

---

## Quick start for a new session

1. Read this file.
2. Skim `lib/schema.sql` and `public/index.html` / `public/admin.html` for UX.
3. Ask David which of (2)–(5) to tackle first.
4. For (2): admin Excel + Blob paths. For (3): `scripts/make-links.mjs`. For (5): `lib/upload-paths.js` + `api/admin-uploads.js` as the base for a dedicated pull surface.
