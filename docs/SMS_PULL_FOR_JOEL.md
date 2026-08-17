# Spec Management System ← SpecInsite Vendor Portal upload pull

Cursor-oriented integration note for Joel.

**Client / deploy:** Rust-Oleum Vendor Portal  
**Base URL:** `https://vendors.specinsite.com`  
**Purpose:** List and download vendor-uploaded PDF/DOCX files into Spec Management System (SMS).  
**Auth env you need from David:** `SMS_PULL_TOKEN` (share via vault — never commit).

---

## Auth

Every request:

```http
x-sms-token: <SMS_PULL_TOKEN>
```

Also accepted:

```http
Authorization: Bearer <SMS_PULL_TOKEN>
```

or `?token=<SMS_PULL_TOKEN>` (prefer header).

401 = bad token. 503 = token not configured on portal.

---

## Endpoints

All `GET`. JSON unless downloading.

### 1) List vendors + upload counts

```http
GET https://vendors.specinsite.com/api/sms-pull
x-sms-token: <SMS_PULL_TOKEN>
```

Response shape:

```json
{
  "ok": true,
  "path_pattern": "uploads/{vendor_id}/{uuid}-{safeName}.{pdf|docx}",
  "vendors": [
    {
      "vendor_id": "mpi-label-systems",
      "vendor_name": "MPI Label Systems",
      "rank": 2,
      "upload_count": 1,
      "last_uploaded_at": "2026-08-06T19:45:04.106Z"
    }
  ]
}
```

Use `vendor_id` as the stable key. Poll vendors where `upload_count` increased or `last_uploaded_at` is newer than your watermark.

### 2) List files for one vendor

```http
GET https://vendors.specinsite.com/api/sms-pull?vendor_id=mpi-label-systems
x-sms-token: <SMS_PULL_TOKEN>
```

Response shape:

```json
{
  "ok": true,
  "vendor_id": "mpi-label-systems",
  "count": 1,
  "path_pattern": "uploads/{vendor_id}/{uuid}-{safeName}.{pdf|docx}",
  "files": [
    {
      "id": 12,
      "vendor_id": "mpi-label-systems",
      "pathname": "uploads/mpi-label-systems/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee-drawing.pdf",
      "original_name": "drawing.pdf",
      "content_type": "application/pdf",
      "byte_size": 123456,
      "uploaded_at": "2026-08-06T19:45:04.106Z"
    }
  ]
}
```

**Store in SMS:** `id` and/or `pathname` (pathname is immutable for that object).  
Do not invent paths — only use values returned here.

Allowed extensions: `.pdf`, `.docx` only.

### 3) Download one file (follow redirect)

By numeric id:

```http
GET https://vendors.specinsite.com/api/sms-pull?id=12
x-sms-token: <SMS_PULL_TOKEN>
```

By pathname (URL-encode the path):

```http
GET https://vendors.specinsite.com/api/sms-pull?pathname=uploads%2Fmpi-label-systems%2F....pdf
x-sms-token: <SMS_PULL_TOKEN>
```

**Behavior:** `302` → short-lived **private** Vercel Blob URL.  
Your client must **follow redirects** and GET the final URL to obtain bytes.

- TTL is on the order of ~15 minutes — download immediately; do not persist the signed Blob URL long-term.
- Persist `pathname` / `id` in SMS; re-call this endpoint when you need the file again.

---

## Recommended sync loop (for Cursor / worker)

```text
1. GET /api/sms-pull
2. For each vendor with upload_count > 0 (or last_uploaded_at > watermark):
   a. GET /api/sms-pull?vendor_id=...
   b. For each file where pathname (or id) not yet in SMS:
      - GET /api/sms-pull?id=...  (follow 302)
      - Save bytes + metadata (vendor_id, original_name, pathname, uploaded_at)
      - Mark ingested
3. Advance watermark
```

Idempotency key: `pathname` (preferred) or `(vendor_id, id)`.

---

## curl smoke tests

```bash
export SMS_PULL_TOKEN='…'   # from vault
export BASE='https://vendors.specinsite.com'

curl -sS -H "x-sms-token: $SMS_PULL_TOKEN" "$BASE/api/sms-pull" | jq .

curl -sS -H "x-sms-token: $SMS_PULL_TOKEN" \
  "$BASE/api/sms-pull?vendor_id=mpi-label-systems" | jq .

# Download (follow redirects, write file)
curl -sS -L -H "x-sms-token: $SMS_PULL_TOKEN" \
  "$BASE/api/sms-pull?id=12" -o ./pulled.pdf
```

---

## Health (no SMS token required)

```http
GET https://vendors.specinsite.com/api/health
```

Look for `"ok": true` and `"sms_pull_token_set": true`.

---

## Guarantees / non-goals

| Guarantee | Detail |
| --- | --- |
| Path stability | `uploads/{vendor_id}/{uuid}-{name}.ext` does not change after upload |
| Isolation | Files are per `vendor_id`; never cross vendors |
| Private storage | Blob is private; only short-lived signed GETs |

| Non-goal | Detail |
| --- | --- |
| Public URLs | No permanent public file URLs |
| Write API | SMS is pull-only; vendors upload via portal |
| Excel templates | Separate download flow; this API is PDF/DOCX uploads only |

---

## Multi-client note

Each SpecInsite client portal (Rust-Oleum, future Whole Foods full portal, etc.) has its **own** base URL and **own** `SMS_PULL_TOKEN`. Do not reuse RO credentials against another host.

---

## Contact

Portal / token issues: David (SpecInsite).  
This doc lives in the Rust-Oleum portal repo as `docs/SMS_PULL_FOR_JOEL.md`.
