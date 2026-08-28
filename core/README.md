# Kanata Core

Kanata Core adalah service independen yang menjadi sumber data dan business rule
untuk bot WhatsApp, web PHP, dan client lain. Data di **MariaDB** (fresh, tidak
migrasi dari sistem lama).

## Menjalankan

```bash
cp .env.example .env
npm ci
npm run migrate
npm start
```

MariaDB wajib tersedia (buat database `kanata_core` dulu). Generate master key
dengan `openssl rand -hex 32` dan jangan pernah menggantinya tanpa proses rotasi
secret client.

## Endpoint

- `GET /health`: liveness tanpa akses database.
- `GET /ready`: readiness MariaDB.
- `POST /v1/auth/login` — login web dengan phone/JID/LID + password; respons
  menyetel cookie `kanata_session`.
- `POST /v1/auth/logout` — hapus session.
- `GET /v1/auth/me` — user dari cookie.
- `GET /v1/identities/resolve?value=...` — resolve phone/JID/LID ke user.
- `POST /v1/identities/attach` — pasang identity ke user.
- `POST /v1/identities/ensure` — cari user atau buat baru dari identity.
- `GET /v1/users` — daftar user (web, role owner).
- `GET /v1/users/:id`, `PATCH /v1/users/:id` — baca/ubah user.
- `POST /v1/users/:id/password` — set password (bot `.integrate`).
- `GET /v1/finance/report`, `GET /v1/finance/kakeibo` — laporan bulanan.
- `PUT /v1/finance/budget` — set target budget.
- `POST /v1/finance/transactions` — catat transaksi.
- `GET|PATCH|DELETE /v1/finance/transactions/:id` — baca/ubah/hapus.
- `DELETE /v1/finance/transactions/last` — hapus transaksi terakhir.

Auth ada dua jalur:
- **Cookie** (`kanata_session`) untuk web client.
- **Service signature** untuk bot/adapter: header `X-Kanata-Client`,
  `X-Kanata-Timestamp`, `X-Kanata-Nonce`, `X-Kanata-Signature`. Payload signature
  adalah HMAC-SHA256 dari `timestamp.nonce.METHOD.path.sha256(body)`. Timestamp
  berlaku maksimal lima menit dan nonce hanya dapat dipakai sekali.

## Status migrasi

Bot dan web PHP masih memakai sistem lama. Core dijalankan berdampingan sampai
dual-write dan rekonsiliasi selesai, lalu traffic dipindah bertahap.
