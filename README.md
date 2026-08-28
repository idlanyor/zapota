# Kanata WhatsApp Bot

Kanata adalah bot WhatsApp berbasis Baileys dengan command hot-reload, database
SQLite/Knex, webhook HTTP + Socket.IO, dan dashboard React/Express terpisah.

## Arsitektur

Project ini terdiri dari dua proses utama:

1. **Bot** (`src/index.js`)
    - Terhubung ke WhatsApp melalui Baileys.
    - Menyimpan data bot di SQLite melalui Knex.
    - Memuat command aktif dari `src/commands/**/*.js`.
    - Menjalankan webhook HTTP dan Socket.IO pada port `8787` secara default.
    - Menjalankan scheduler grup, jadwal salat, backup, dan jadibot.
2. **Dashboard** (`webui/src/server.js`)
    - Backend Express dan Socket.IO pada port `3000` secara default.
    - Menyimpan user dashboard, session, audit, dan data dashboard di MongoDB.
    - Menyajikan frontend React hasil build dari `webui/web/dist`.

Komunikasi antarkomponen:

```text
WhatsApp ↔ Bot/Baileys ↔ SQLite (runtime bot)
                    ├─ HTTP → Kanata Core (MariaDB) — data finance, auth, identity
                    ├─ Socket.IO → Dashboard (`WEBAPP_URL` + `ACCESS_KEY`)
                    └─ Webhook  ← Dashboard (`BOT_WEBHOOK_URL` + `BOT_WEBHOOK_TOKEN`)
                                      ↕
                                   MongoDB
Web PHP ── service-signature HTTP ──> Kanata Core
```

**Kanata Core** (`core/`) adalah service independen (Node.js + MariaDB) yang menjadi
sumber data dan business rule: identity user (phone/JID/LID), auth web (session cookie),
dan finance (transaksi/budget/kakeibo). Bot menjadi WhatsApp adapter, web PHP menjadi
client. Service auth bot/PHP memakai HMAC signature (`X-Kanata-*` headers).

Data finance di bot kini disimpan di Core, bukan SQLite. Gemini/OCR tetap berjalan di
bot (`processAiTransaction`), hasilnya dikirim ke Core untuk disimpan.

## Struktur penting

- `src/commands/`: plugin command aktif berakhiran `.js`.
- `src/database/`: model, migration Knex, dan adapter kompatibilitas Mongoose.
- `src/handlers/`: alur pesan, tombol, dan event grup.
- `src/services/`: webhook dan integrasi layanan eksternal.
- `webui/src/`: backend dashboard Express.
- `webui/web/`: frontend React + Vite.
- `php_client/`: client PHP untuk beberapa fungsi webhook.
- `auth_info_baileys/`: credential sesi WhatsApp utama.
- `sessions_jadibot/`: credential sesi jadibot.
- `data/`, `logs/`, `results/`, `temp/`: data dan output runtime.

File `.jss` di dalam direktori command sengaja tidak dimuat oleh plugin loader.

## Persyaratan

- Node.js modern. Project saat ini telah diverifikasi dengan Node `v24.18.0`
  melalui NVM.
- npm dan dependency sesuai lockfile.
- FFmpeg untuk pemrosesan audio/video.
- MongoDB jika dashboard digunakan.
- Chromium beserta dependency sistem Puppeteer untuk fitur browser/screenshot.
- Dependency native yang diperlukan `canvas`, `sharp`, dan `better-sqlite3`.

Aktifkan Node dari NVM jika shell belum mengenali `node`:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 24
```

## Konfigurasi environment

Bot membaca `.env` di root project. Dashboard membaca `webui/.env` ketika proses
dijalankan dari direktori `webui`.

```bash
cp .env.example .env
cp webui/.env.example webui/.env
chmod 600 .env webui/.env
```

Variabel penghubung kedua proses harus konsisten:

| Bot (`.env`)        | Dashboard (`webui/.env`) | Fungsi                                      |
| ------------------- | ------------------------ | ------------------------------------------- |
| `ACCESS_KEY`        | `ACCESS_KEY`             | Autentikasi Socket.IO internal bot          |
| `WEBAPP_URL`        | `PORT`                   | Alamat dashboard yang dihubungi bot         |
| `BOT_WEBHOOK_TOKEN` | `BOT_WEBHOOK_TOKEN`      | Autentikasi webhook                         |
| `BOT_WEBHOOK_PORT`  | `BOT_WEBHOOK_URL`        | Alamat webhook bot yang dipanggil dashboard |

Dashboard mewajibkan:

- `ACCESS_KEY`, minimal 16 karakter.
- `SUPERADMIN_PASSWORD`, minimal 16 karakter.
- `SUPERADMIN_JID`, misalnya `628123456789@s.whatsapp.net`.
- `MONGODB_URI` yang dapat diakses.

Gunakan secret acak yang berbeda untuk `ACCESS_KEY`, password superadmin, token
webhook, dan token enkripsi. Jangan commit `.env` atau credential Baileys.

`SUPERADMIN_PASSWORD` hanya dipakai ketika identity owner pertama kali dibuat atau
ketika record lama belum memiliki hash. Mengganti nilainya di `.env` tidak otomatis
mengganti password owner yang sudah tersimpan di MongoDB.

Integrasi lain seperti Gemini, Cloudflare, Pterodactyl, SMM, iLovePDF, dan blog
bersifat feature-specific. Lihat komentar pada `.env.example` untuk variabelnya.

## Instalasi dan menjalankan bot

Dengan lockfile yang tersedia, gunakan `npm ci` agar instalasi reproducible:

```bash
npm ci
npm run db:migrate
npm start
```

Untuk development dengan restart otomatis:

```bash
npm run dev
```

Saat belum ada sesi WhatsApp, QR pairing dicetak oleh handler koneksi ke terminal.
Scan QR tersebut dari perangkat WhatsApp. Credential kemudian disimpan di
`auth_info_baileys/`. Jika sesi berstatus logout, proses berhenti dan perlu pairing
ulang; folder sesi tidak dihapus otomatis.

Webhook dimulai bersama bot hanya jika `BOT_WEBHOOK_TOKEN` terisi. Dokumentasi
endpoint lengkap tersedia di `WEBHOOK_API.md`.

## Menjalankan dashboard

### Production/local build

```bash
cd webui
npm ci
cd web
npm ci
npm run build
cd ..
npm start
```

Backend akan terhubung ke MongoDB, memastikan identity owner tersedia, lalu
menyajikan frontend dari `webui/web/dist`.

### Development

Install dependency backend dan frontend terlebih dahulu, lalu dari `webui/`:

```bash
npm run dev
```

Perintah ini menjalankan backend dengan `node --watch` dan Vite secara bersamaan.
Frontend development tersedia di port `5173`, sedangkan API dashboard menggunakan
port `3000` secara default.

## Database dan migration

Bot menggunakan SQLite dengan lokasi default `data/bot.db`. Lokasi dapat diubah
melalui `SQLITE_PATH`.

```bash
npm run db:migrate
npm run db:rollback
```

Dashboard menggunakan MongoDB dan tidak memakai migration Knex milik bot.

## Test dan kualitas kode

```bash
npm test
npm run lint
```

`npm test` menjalankan suite Jest lalu suite adapter SQLite berbasis `node:test`.
Keduanya juga dapat dijalankan secara terpisah:

```bash
npm run test:jest
npm run test:adapter
```

Perintah berikut mengubah file, bukan sekadar memeriksa:

```bash
npm run lint:fix
npm run format
```

## Deployment

### PM2

```bash
npm run pm2
```

Konfigurasi berada di `ecosystem.config.js`, menjalankan satu instance bot dan
menulis output ke `logs/pm2-out.log` serta `logs/pm2-err.log`.

### systemd

Template `kanata-bot.service` saat ini menunjuk ke:

- project: `/home/roy/mybot`
- Node: `/home/roy/.nvm/versions/node/v24.18.0/bin/node`
- user: `roy`

Sesuaikan nilai tersebut jika lokasi deployment berubah. Instalasi atau restart
service membutuhkan hak administrator.

## Data sensitif dan Git

Jangan membagikan atau memasukkan file/folder berikut ke version control:

- `.env` dan `core/.env`
- `auth_info_baileys/`, `backup_auth/`, dan `sessions_jadibot/`
- database di `data/`
- backup, log (`logs/`), temporary (`temp/`), dan output media (`results/`)
- folder yang di-ignore seperti `/webui`, `werewolf/`, dan `unused/`

