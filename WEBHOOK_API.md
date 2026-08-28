# Webhook API

Webhook API menyediakan akses HTTP untuk mengirim pesan WhatsApp, mengelola data
keuangan, sesi jadibot, pengguna, pengaturan bot, dan Cloudflare.

## Menjalankan API

API dimulai bersama bot melalui `npm start`, `npm run dev`, atau `npm run pm2`.
Server hanya dimulai jika `BOT_WEBHOOK_TOKEN` telah diisi.

```env
BOT_WEBHOOK_PORT=8787
BOT_WEBHOOK_TOKEN=replace_with_long_random_token
BOT_WEBHOOK_ALLOWLIST=127.0.0.1,10.0.0.12
```

| Variabel                | Wajib | Default  | Keterangan                                                               |
| ----------------------- | ----- | -------- | ------------------------------------------------------------------------ |
| `BOT_WEBHOOK_TOKEN`     | Ya    | -        | Token rahasia untuk autentikasi Bearer. Tanpa token, API tidak berjalan. |
| `BOT_WEBHOOK_PORT`      | Tidak | `8787`   | Port HTTP dan Socket.IO.                                                 |
| `BOT_WEBHOOK_ALLOWLIST` | Tidak | semua IP | Daftar IP sumber yang dipisahkan koma.                                   |

Contoh berikut memakai base URL `http://localhost:8787`.

## Autentikasi dan batasan

Semua endpoint selain `GET /health` memerlukan header:

```http
Authorization: Bearer YOUR_WEBHOOK_TOKEN
```

- Rate limit: 60 request per menit untuk setiap kombinasi IP dan token. Penyimpanan
  rate limit berada di memori dan direset ketika proses dimulai ulang.
- Ukuran body maksimum: 1 MB. Body yang melebihi batas menghasilkan `400`.
- Body request harus berupa JSON valid.
- Jika allowlist diisi, IP diperiksa sebelum token. Nilai pertama pada
  `X-Forwarded-For` digunakan sebagai IP klien; pastikan header ini hanya dapat
  ditulis oleh reverse proxy tepercaya.
- Endpoint bertanda **owner-only** juga memerlukan `userId` milik owner. Bearer
  token tetap wajib.

Contoh request:

```bash
curl -X POST http://localhost:8787/api/webhook/send-text \
  -H 'Authorization: Bearer YOUR_WEBHOOK_TOKEN' \
  -H 'Content-Type: application/json' \
  -d '{"to":"628123456789","text":"Halo dari webhook"}'
```

## Ringkasan endpoint

| Method                  | Path                            | Akses        |
| ----------------------- | ------------------------------- | ------------ |
| `GET`                   | `/health`                       | Publik       |
| `POST`                  | `/api/webhook/auth/login`       | Bearer token |
| `POST`                  | `/api/webhook/send-text`        | Bearer token |
| `POST`                  | `/api/webhook/send-document`    | Bearer token |
| `GET`                   | `/api/webhook/finance/report`   | Bearer token |
| `POST`                  | `/api/webhook/finance/catat`    | Bearer token |
| `POST`                  | `/api/webhook/finance/update`   | Bearer token |
| `DELETE`                | `/api/webhook/finance/delete`   | Bearer token |
| `GET`                   | `/api/webhook/finance/detail`   | Bearer token |
| `GET`                   | `/api/webhook/finance/kakeibo`  | Bearer token |
| `POST`                  | `/api/webhook/finance/budget`   | Bearer token |
| `GET`                   | `/api/webhook/cloudflare/zones` | Owner-only   |
| `GET`, `POST`           | `/api/webhook/cloudflare/dns`   | Owner-only   |
| `GET`, `POST`, `DELETE` | `/api/webhook/cloudflare/rules` | Owner-only   |
| `GET`                   | `/api/webhook/users/list`       | Owner-only   |
| `POST`                  | `/api/webhook/users/update`     | Owner-only   |
| `GET`                   | `/api/webhook/settings`         | Owner-only   |
| `POST`                  | `/api/webhook/settings/update`  | Owner-only   |
| `POST`                  | `/api/webhook/jadibot/start`    | Bearer token |
| `GET`                   | `/api/webhook/jadibot/sessions` | Bearer token |
| `POST`                  | `/api/webhook/jadibot/stop`     | Bearer token |

## Health check

`GET /health` tidak memerlukan autentikasi.

```json
{ "ok": true, "service": "webhook-api" }
```

## Login web

`POST /api/webhook/auth/login`

| Field      | Tipe   | Wajib | Keterangan                                          |
| ---------- | ------ | ----- | --------------------------------------------------- |
| `username` | string | Ya    | Nomor WhatsApp; karakter selain angka akan dihapus. |
| `password` | string | Ya    | Password web yang tersimpan untuk pengguna.         |

Respons sukses berisi `userId`, `username`, `whatsappNumber`, dan `isOwner`.

## Pesan WhatsApp

### Kirim teks

`POST /api/webhook/send-text`

| Field  | Tipe   | Wajib | Keterangan                                                                    |
| ------ | ------ | ----- | ----------------------------------------------------------------------------- |
| `to`   | string | Ya    | Nomor WhatsApp atau JID. Nomor biasa dinormalisasi menjadi `@s.whatsapp.net`. |
| `text` | string | Ya    | Isi pesan; teks kosong ditolak.                                               |

API menghasilkan `503` jika socket bot belum tersedia.

### Kirim dokumen

`POST /api/webhook/send-document`

| Field      | Tipe   | Wajib | Default           |
| ---------- | ------ | ----- | ----------------- |
| `to`       | string | Ya    | -                 |
| `data`     | string | Ya    | -                 |
| `fileName` | string | Tidak | `document.pdf`    |
| `mimetype` | string | Tidak | `application/pdf` |
| `caption`  | string | Tidak | string kosong     |

`data` dapat berupa Base64 mentah atau data URL, misalnya
`data:application/pdf;base64,...`.

Respons sukses kedua endpoint:

```json
{
    "ok": true,
    "data": {
        "to": "628123456789@s.whatsapp.net",
        "messageId": "BAE5D8E8F8E..."
    }
}
```

## Finance

### Laporan transaksi

`GET /api/webhook/finance/report`

| Query       | Wajib | Keterangan                                       |
| ----------- | ----- | ------------------------------------------------ |
| `userId`    | Ya    | ID pengguna.                                     |
| `month`     | Tidak | Bulan kalender `1`-`12`; default bulan berjalan. |
| `year`      | Tidak | Tahun; default tahun berjalan.                   |
| `type`      | Tidak | Filter tipe transaksi.                           |
| `category`  | Tidak | Filter kategori.                                 |
| `startDate` | Tidak | Awal rentang tanggal.                            |
| `endDate`   | Tidak | Akhir rentang tanggal.                           |

### Catat transaksi

`POST /api/webhook/finance/catat`

Field umum: `userId` wajib dan `userName` opsional (default `Web User`). Ada dua
mode input:

1. AI: isi `text` dan/atau `fileBase64`. `mimeType` opsional dan default-nya
   `image/jpeg` untuk file.
2. Manual: isi `type` dan `amount`. Field opsionalnya adalah `category`,
   `description`, `date`, dan `kakeiboCategory`.

Jika `text` atau `fileBase64` tersedia, API selalu memakai mode AI.

### Ubah transaksi

`POST /api/webhook/finance/update`

`userId` dan `transactionId` wajib. Field yang dapat diubah: `type`, `amount`,
`category`, `description`, `date`, dan `kakeiboCategory`.

### Hapus transaksi

`DELETE /api/webhook/finance/delete`

`userId` wajib. `transactionId` opsional; jika tidak diberikan, service menghapus
transaksi terakhir milik pengguna.

### Detail transaksi

`GET /api/webhook/finance/detail?userId=...&transactionId=...`

Kedua query parameter wajib. Jika data tidak ditemukan, respons tetap `200`
dengan `ok: false` dan `data: null`.

### Laporan kakeibo

`GET /api/webhook/finance/kakeibo`

`userId` wajib. `month` (`1`-`12`) dan `year` opsional, dengan default periode
berjalan.

### Atur budget

`POST /api/webhook/finance/budget`

| Field           | Wajib | Keterangan                                         |
| --------------- | ----- | -------------------------------------------------- |
| `userId`        | Ya    | ID pengguna.                                       |
| `month`         | Ya    | Bulan sesuai format yang digunakan service budget. |
| `year`          | Ya    | Tahun.                                             |
| `incomeTarget`  | Tidak | Target pemasukan.                                  |
| `savingsTarget` | Tidak | Target tabungan.                                   |

## Cloudflare (owner-only)

Untuk request `GET`, kirim `userId` sebagai query parameter. Untuk request lain,
kirim `userId` dalam body JSON.

### Zona

`GET /api/webhook/cloudflare/zones?userId=...&page=1`

`page` opsional dan default-nya `1`.

### DNS

- `GET /api/webhook/cloudflare/dns`: membutuhkan `userId` dan `zoneId`; `page`
  opsional.
- `POST /api/webhook/cloudflare/dns`: membutuhkan `userId`, `zoneId`, `type`,
  `name`, dan `content`; `proxied` opsional dan diubah menjadi boolean.

### Rules

- `GET /api/webhook/cloudflare/rules`: membutuhkan `userId`; `mode` dan `page`
  opsional.
- `POST /api/webhook/cloudflare/rules`: membutuhkan `userId`, `ip`, dan `mode`;
  `notes` opsional.
- `DELETE /api/webhook/cloudflare/rules`: membutuhkan `userId` dan `ip`.

## Manajemen pengguna (owner-only)

### Daftar pengguna

`GET /api/webhook/users/list`

`userId` wajib. Query opsional: `page` (default `1`), `limit` (default `20`), dan
`search`. Respons menyertakan `users`, `total`, `page`, dan `totalPages`.

### Ubah pengguna

`POST /api/webhook/users/update`

`userId` dan `targetJid` wajib. Field yang dapat diubah adalah `balance`, `role`,
`name`, `emailCloud`, dan `phoneNumber`. Pengguna dibuat jika `targetJid` belum
ada.

## Pengaturan bot (owner-only)

- `GET /api/webhook/settings?userId=...` mengambil pengaturan bot.
- `POST /api/webhook/settings/update` membutuhkan `userId` dan sedikitnya satu
  field yang diizinkan: `mode`, `autoStatusRead`, `autoAiPrivate`,
  `mustJoinGroup`, `groupInviteLink`, atau `privateAiPersona`.

## Jadibot

- `POST /api/webhook/jadibot/start` membutuhkan `phoneNumber`.
- `GET /api/webhook/jadibot/sessions` menampilkan seluruh sesi.
- `POST /api/webhook/jadibot/stop` membutuhkan `phoneNumber`.

Status pairing dan sesi juga dapat dikirim melalui Socket.IO pada port yang sama.
Socket.IO saat ini memakai CORS origin `*` dan tidak menerapkan autentikasi Bearer
dari middleware HTTP di atas.

## Format respons dan error

Mayoritas respons sukses memakai bentuk berikut:

```json
{ "ok": true, "data": {} }
```

Respons error:

```json
{ "ok": false, "error": "Pesan error" }
```

| Status | Arti                                                         |
| ------ | ------------------------------------------------------------ |
| `400`  | Parameter kurang, JSON tidak valid, atau body melebihi 1 MB. |
| `401`  | Bearer token/credential login tidak valid.                   |
| `403`  | IP tidak diizinkan atau pengguna bukan owner.                |
| `404`  | Route tidak ditemukan.                                       |
| `429`  | Rate limit terlampaui.                                       |
| `500`  | Error internal atau kegagalan service eksternal.             |
| `503`  | Socket WhatsApp tidak tersedia saat mengirim pesan.          |
