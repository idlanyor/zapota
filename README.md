# Kanata WhatsApp Bot

Kanata adalah bot WhatsApp berbasis Node.js dengan plugin command, transport `zapo-js`
atau Baileys, database SQLite/Knex, webhook HTTP + Socket.IO, dan service data
Kanata Core berbasis MariaDB.

## Status repository

Komponen yang tersedia dan dilacak Git:

- **Bot WhatsApp** di `src/`.
- **Kanata Core** di `core/`.
- **Web client PHP** di `php_client/`.
- **161 plugin command aktif** (`src/commands/**/*.js`) pada audit 28 Agustus 2026.
- Template deployment PM2, systemd, Nginx, dan PHP-FPM.

Direktori `webui/`, `werewolf/`, dan `unused/` di-ignore dan bukan bagian source yang
dilacak. README ini tidak menganggap komponen tersebut tersedia pada fresh clone.

## Arsitektur

```text
WhatsApp ↔ Bot (`src/index.js`) ↔ SQLite
              ├─ HTTP + HMAC → Kanata Core (`core/`) ↔ MariaDB
              ├─ HTTP webhook :8787 ← integrasi eksternal / web PHP
              └─ Socket.IO → client internal yang memakai `ACCESS_KEY`

Web PHP (`php_client/`) ── HTTP + HMAC ──> Kanata Core :8790
                       └── HTTP webhook ──> Bot :8787
```

### Bot

Entry point `src/index.js` menjalankan:

- koneksi WhatsApp melalui adapter `src/wa/`;
- migration dan akses SQLite melalui Knex;
- pemuatan/hot-reload plugin command dari `src/commands/**/*.js`;
- webhook HTTP + Socket.IO bila `BOT_WEBHOOK_TOKEN` tersedia;
- scheduler grup dan jadwal salat;
- recurring task, backup, dan layanan jadibot.

Transport dipilih melalui `WA_TRANSPORT`:

- `zapo`: credential disimpan di SQLite (`ZAPO_DB_PATH`);
- `baileys`: credential utama disimpan di `auth_info_baileys/`, credential jadibot di
  `sessions_jadibot/`.

`.env.example` memilih `zapo`. Jika `WA_TRANSPORT` tidak diisi, fallback runtime di
`src/config/settings.js` adalah `baileys`.

### Kanata Core

`core/` adalah service Node.js independen dan sumber data untuk:

- identity phone/JID/LID;
- user dan role;
- session web berbasis cookie;
- transaksi, budget, laporan, dan kakeibo.

Bot dan web PHP mengakses Core dengan HMAC-SHA256 melalui header `X-Kanata-*`.
Detail endpoint dan signature tersedia di `core/README.md`.

Fitur finance bot sudah memakai Core untuk penyimpanan. Ekstraksi transaksi dari teks,
gambar, atau audio tetap berjalan di bot dengan Gemini, lalu hasilnya disimpan ke Core.

### Web client PHP

`php_client/` berisi UI PHP untuk login, user, pesan, finance/kakeibo, jadibot, dan
pengaturan. Client memakai `KANATA_CORE_URL` untuk data/auth serta
`KANATA_BOT_WEBHOOK_URL` untuk operasi bot.

## Fitur command

Plugin aktif dikelompokkan dalam:

- AI dan vision;
- blog dan Cloudflare;
- downloader media;
- finance;
- game dan Werewolf command adapter;
- administrasi grup dan jadwal salat;
- owner/admin;
- Pterodactyl/panel;
- RPG;
- sticker;
- PDF, OCR, image, audio, dan utility lain;
- registrasi, profil, balance, voucher, dan store.

Daftar command aktual berasal dari metadata plugin dan dapat dilihat melalui command
menu bot. File `.jss` sengaja tidak dimuat oleh plugin loader.

## Struktur penting

```text
src/
├── commands/       plugin command aktif
├── config/         konfigurasi bot dan Knex
├── database/       adapter, model, dan migration SQLite
├── handlers/       alur pesan, tombol, dan event grup
├── lib/            runtime, scheduler, media, renderer, dan helper
├── services/       Core, webhook, AI, Cloudflare, jadibot, dan integrasi lain
├── utils/          logger, session, crypto, dan serialisasi
└── wa/             adapter zapo-js dan Baileys
core/               service identity, auth, user, dan finance berbasis MariaDB
php_client/         web client PHP
__tests__/          suite Jest tingkat aplikasi
scripts/            utility migration dan pemeriksaan Bun
deploy/             contoh konfigurasi Nginx dan PHP-FPM
```

## Persyaratan

- Node.js modern; kondisi ini diverifikasi dengan Node `v24.18.0` dan npm `11.16.0`.
- npm dan dependency sesuai lockfile.
- MariaDB untuk Kanata Core.
- PHP-FPM dan web server bila memakai `php_client/`.
- FFmpeg untuk pemrosesan audio/video.
- Chromium beserta dependency sistem Puppeteer untuk fitur browser/screenshot.
- Build dependency native untuk `canvas`, `sharp`, `bcrypt`, dan `better-sqlite3`.

Jika memakai NVM:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
```

## Instalasi

### 1. Bot

```bash
cp .env.example .env
npm ci
npm run db:migrate
```

Isi minimal sesuai fitur yang dipakai. Bot dasar memerlukan konfigurasi owner dan
transport. Finance memerlukan koneksi Kanata Core. Integrasi lain hanya memerlukan
secret ketika command terkait digunakan.

Variabel utama:

| Variabel | Default/contoh | Fungsi |
| --- | --- | --- |
| `WA_TRANSPORT` | `zapo` di `.env.example` | `zapo` atau `baileys` |
| `ZAPO_DB_PATH` | `./data/zapo-auth.sqlite` | database auth zapo-js |
| `SQLITE_PATH` | `./data/bot.db` | database runtime bot |
| `BOT_PREFIX` | `.` | prefix command |
| `OWNER_NUMBER`, `OWNER_LID` | lihat `.env.example` | identity owner |
| `BOT_WEBHOOK_PORT` | `8787` | port webhook bot |
| `BOT_WEBHOOK_TOKEN` | wajib agar webhook aktif | bearer token webhook |
| `BOT_WEBHOOK_ALLOWLIST` | kosong | allowlist IP opsional |
| `KANATA_CORE_URL` | `http://127.0.0.1:8790` | endpoint Core |
| `KANATA_CORE_CLIENT_ID` | — | ID client HMAC bot |
| `KANATA_CORE_CLIENT_SECRET` | — | secret client HMAC bot |
| `GEMINI_API_KEY` | — | AI finance/fitur Gemini |
| `ACCESS_KEY` | — | autentikasi Socket.IO internal |

`.env.example` juga mendokumentasikan Cloudflare, Pterodactyl, SMM, blog, Alice,
Ireng, Pinterest, Telegram, iLovePDF, dan konfigurasi AI lain.

### 2. Kanata Core

```bash
cp core/.env.example core/.env
npm --prefix core ci
npm --prefix core run migrate
```

Buat database MariaDB lebih dulu. `CORE_MASTER_KEY` harus berupa 64 karakter hex:

```bash
openssl rand -hex 32
```

Buat client HMAC untuk bot setelah Core terkonfigurasi:

```bash
npm --prefix core run client:create
```

Masukkan ID dan secret yang dihasilkan ke `.env` bot sebagai
`KANATA_CORE_CLIENT_ID` dan `KANATA_CORE_CLIENT_SECRET`. Jangan mengganti
`CORE_MASTER_KEY` tanpa proses rotasi secret.

## Menjalankan

Jalankan Core dan bot pada terminal terpisah:

```bash
npm --prefix core start
npm start
```

Mode development:

```bash
npm --prefix core run dev
npm run dev
```

`nodemon` memantau `src/` tetapi mengabaikan `src/commands/` karena plugin command
memiliki mekanisme reload sendiri.

Saat belum ada sesi WhatsApp, adapter menampilkan proses pairing di terminal. Webhook
bot hanya dimulai jika `BOT_WEBHOOK_TOKEN` terisi. Dokumentasi endpoint tersedia di
`WEBHOOK_API.md`.

## Database dan migration

### Bot: SQLite + Knex

Database default berada di `data/bot.db` dan dapat diubah dengan `SQLITE_PATH`.
Migration mencakup user, transaksi legacy, server, budget, grup, polling, settings,
voucher, RPG, AFK, dan progress RPG.

```bash
npm run db:migrate
npm run db:rollback
```

### Core: MariaDB

```bash
npm --prefix core run migrate
```

Core tidak memakai migration Knex milik bot. Konfigurasi koneksi berada di
`core/.env` melalui `DATABASE_URL`.

## Test dan kualitas kode

```bash
npm test
npm --prefix core test
npm run lint
```

`npm test` menjalankan Jest lalu tiga suite `node:test` untuk adapter SQLite, pencarian
YouTube, dan parser API Utama. Audit 28 Agustus 2026 menghasilkan:

- bot: **22 suite Jest / 151 test** dan **25 test Node**, semua lulus;
- Core: **13 test**, semua lulus;
- JavaScript yang dilacak Git: lint lulus.

Pada working tree audit, `npm run lint` penuh gagal pada 63 error di direktori lokal
`werewolf/` yang di-ignore dan tidak dilacak. Fresh clone tidak memuat direktori itu.
Untuk memeriksa hanya JavaScript yang dilacak:

```bash
git ls-files '*.js' -z | xargs -0 npx eslint --quiet
```

Perintah berikut mengubah file:

```bash
npm run lint:fix
npm run format
```

## Deployment

### PM2

```bash
npm run pm2
```

`ecosystem.config.js` menjalankan dua proses:

- `kanata-bot` dari `src/index.js`, batas restart memory 2 GB;
- `kanata-core` dari `core/src/server.js`, batas restart memory 1 GB.

Log ditulis ke `logs/pm2-*.log` dan `logs/core-*.log`.

### systemd

`kanata-bot.service` hanya menjalankan bot dan saat ini menunjuk ke:

- project: `/home/roy/mybot`;
- Node: `/home/roy/.nvm/versions/node/v24.18.0/bin/node`;
- user: `roy`.

Sesuaikan semua path/user sebelum memasang service. Core memerlukan unit terpisah atau
PM2.

### Nginx dan PHP-FPM

Contoh deployment web PHP berada di:

- `deploy/nginx/kanata.irengcloud.com.conf`;
- `deploy/php-fpm/kanata.conf.example`.

Tinjau domain, path, socket PHP-FPM, TLS, dan environment sebelum dipakai.

## Data sensitif dan Git

Jangan commit atau bagikan:

- `.env`, `core/.env`, dan secret HMAC;
- `auth_info_baileys/`, `backup_auth/`, `sessions_jadibot/`, dan `backups/`;
- database di `data/`;
- log, temp, cache, backup, dan output media;
- credential atau dump dari integrasi eksternal.

`.gitignore` juga mengecualikan `webui/`, `werewolf/`, dan `unused/`; keberadaan lokal
folder tersebut bukan bagian distribusi repository.

## Dokumentasi terkait

- `WEBHOOK_API.md`: endpoint webhook bot.
- `core/README.md`: endpoint, auth, dan operasi Kanata Core.
- `PRD_RPG.md`: spesifikasi fitur RPG.
- `PRD_Werewolf.md`: spesifikasi integrasi Werewolf.
