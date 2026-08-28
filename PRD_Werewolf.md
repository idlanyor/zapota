# Product Requirements Document (PRD)

## Game Werewolf Multiplayer — WhatsApp Bot

**Versi:** 1.0
**Platform:** WhatsApp Group
**Jenis Produk:** Multiplayer Social Deduction Game
**Target:** Bot WhatsApp berbasis Node.js / JavaScript ESM
**Mode Permainan:** Group-based, real-time, turn-based

---

# 1. Ringkasan Produk

Werewolf Bot WhatsApp adalah game multiplayer social deduction yang dimainkan langsung di dalam grup WhatsApp.

Pemain tidak perlu membuka website atau aplikasi lain. Semua proses permainan dilakukan melalui:

- Pesan grup WhatsApp
- Private chat antara bot dan pemain
- Command bot
- Tombol/list message jika library WhatsApp mendukung

Bot bertugas sebagai **Game Master otomatis**, meliputi:

- Membuat room
- Mendaftarkan pemain
- Membagikan role secara rahasia
- Mengatur fase malam dan siang
- Mengelola skill setiap role
- Mengatur voting
- Mengeliminasi pemain
- Mengecek kondisi kemenangan
- Menampilkan hasil permainan

Konsep utama:

> **Group = Game Room**
> **Private Chat = Secret Action**

---

# 2. Tujuan Produk

Tujuan utama Werewolf Bot adalah menyediakan permainan Werewolf yang:

- Bisa dimainkan sepenuhnya lewat WhatsApp
- Tidak membutuhkan moderator manusia
- Mendukung banyak pemain
- Memiliki sistem role yang fleksibel
- Meminimalkan kecurangan
- Mudah digunakan dengan command sederhana
- Memiliki pengalaman permainan yang cepat dan interaktif
- Dapat diperluas dengan role, achievement, ranked, dan fitur ekonomi

---

# 3. Target Pengguna

Target utama adalah pengguna WhatsApp yang:

- Aktif dalam grup komunitas
- Sering bermain game bersama teman
- Menyukai Werewolf / Mafia / social deduction
- Tidak ingin menginstal aplikasi tambahan

Target jumlah pemain:

**Minimum:** 5 pemain
**Ideal:** 8–15 pemain
**Maximum MVP:** 15 pemain

Satu pemain hanya boleh terdaftar dalam satu game Werewolf aktif pada saat yang sama,
meskipun game tersebut berada di grup berbeda.

---

# 4. Game Flow

Alur utama permainan:

```text
Lobby
  ↓
Join Player
  ↓
Start Game
  ↓
Assign Roles
  ↓
Night Phase
  ↓
Role Actions
  ↓
Resolve Night
  ↓
Morning
  ↓
Discussion
  ↓
Voting
  ↓
Elimination
  ↓
Check Win Condition
  ↓
Night Phase
```

Siklus Night → Day → Voting terus berulang sampai salah satu faction menang.

---

# 5. Faction

Game memiliki tiga jenis faction utama.

## 5.1 Village

Tujuan:

> Mengeliminasi seluruh Werewolf.

Contoh role:

- Villager
- Seer
- Doctor
- Guardian
- Witch
- Hunter

---

## 5.2 Werewolf

Tujuan:

> Menguasai desa dengan membuat jumlah Werewolf sama atau lebih banyak dari pemain Village.

Contoh role:

- Werewolf
- Alpha Wolf
- Wolf Seer
- Werewolf Cub

---

## 5.3 Neutral

Neutral memiliki kondisi kemenangan sendiri.

Contoh:

- Jester
- Serial Killer
- Survivor

Neutral dapat menang sendiri atau bersama faction tertentu tergantung role.

---

# 6. Role MVP

Untuk versi pertama, role dibatasi agar balancing lebih mudah.

## Villager

### Villager

Tidak memiliki kemampuan khusus.

Tujuan:

> Menemukan dan mengeliminasi Werewolf.

---

### Seer

Setiap malam dapat memilih satu pemain.

Bot memberikan informasi:

```text
🔮 Hasil investigasi:

@Roy memiliki aura WEREWOLF.
```

atau:

```text
🔮 Hasil investigasi:

@Roy bukan Werewolf.
```

---

### Doctor

Setiap malam memilih satu pemain untuk dilindungi.

Jika target dibunuh Werewolf:

```text
Werewolf menyerang seseorang malam ini...

Namun seseorang berhasil menyelamatkannya.
```

Target tidak mati.

Rules configurable:

```text
selfHeal: true
repeatTarget: false
```

---

### Guardian

Guardian dapat memilih satu pemain untuk dilindungi pada salah satu fase malam.
Skill ini hanya mempunyai **satu charge untuk seluruh permainan**.

```text
🛡️ GUARDIAN

Pilih satu pemain yang ingin kamu lindungi malam ini:

.ww guard <nomor>
```

Aturan Guardian pada MVP:

- Guardian boleh memilih dirinya sendiri
- Target harus pemain yang masih hidup
- Target kebal dari seluruh sumber kematian malam itu, termasuk serangan Werewolf
  dan racun Witch
- Skill baru dikonsumsi setelah action valid diterima
- Setelah digunakan, Guardian tidak mempunyai night action lagi
- Identitas Guardian dan target perlindungan tidak diumumkan

---

### Witch

Witch berada di faction Village dan mempunyai dua ramuan:

- **Ramuan Racun** — meracuni satu pemain hidup
- **Ramuan Ajaib** — melindungi seluruh pemain faction Village dari serangan
  Werewolf pada malam tersebut

Setiap ramuan hanya dapat dipakai satu kali selama permainan. Witch hanya boleh
menggunakan maksimal satu ramuan per malam, sehingga kedua ramuan tidak dapat dipakai
bersamaan.

```text
🧙 WITCH

Gunakan salah satu:

.ww potion poison <nomor>
.ww potion magic
```

Aturan Witch pada MVP:

- Ramuan Racun hanya dapat menargetkan pemain lain yang masih hidup
- Korban racun mati saat resolusi malam, kecuali sedang dilindungi Guardian
- Doctor tidak dapat menyembuhkan racun
- Ramuan Ajaib hanya membatalkan serangan Werewolf terhadap faction Village
- Ramuan Ajaib tidak melindungi Werewolf atau Neutral dan tidak membatalkan racun
- Action valid langsung mengonsumsi ramuan terkait dan tidak dapat diganti
- Witch boleh melewati malam tanpa menggunakan ramuan

Validasi dan konsumsi ramuan harus atomic. Dua command Witch yang masuk hampir
bersamaan pada ronde yang sama hanya boleh menerima action pertama yang valid.

Jika Ramuan Ajaib digunakan, pagi hari selalu mengumumkan:

```text
🧙 Penyihir telah menggunakan ramuan ajaibnya untuk melindungi warga desa.
```

Nama pemain Witch tidak diumumkan. Jika seluruh serangan Werewolf berhasil dibatalkan
dan tidak ada kematian lain, hasil pagi menyatakan tidak ada warga yang mati.

---

### Hunter

Jika Hunter mati, Hunter dapat memilih satu pemain untuk ikut mati.

Bot mengirim PM:

```text
🏹 Kamu mati!

Sebagai Hunter, kamu mempunyai satu tembakan terakhir.

.ww shoot @player
```

Aturan Hunter pada MVP:

- Skill aktif jika Hunter mati karena serangan malam atau voting desa
- Bot masuk ke fase `HUNTER_SHOT` maksimal 30 detik
- Target harus pemain lain yang masih hidup
- Jika Hunter tidak menembak sampai waktu habis, skill dianggap dilewati
- Setelah tembakan diselesaikan, bot mengecek kondisi kemenangan sebelum lanjut fase

---

## Werewolf

### Werewolf

Setiap malam Werewolf memilih target untuk dibunuh.

Jika Werewolf berjumlah lebih dari satu, masing-masing melakukan vote secara rahasia.

Target dengan vote terbanyak diserang.

Contoh PM:

```text
🌕 MALAM TELAH TIBA

Pilih korban malam ini:

1. Roy
2. Andi
3. Budi
4. Siti

Gunakan:

.ww kill 2
```

---

## Neutral

### Jester

Jester tidak memiliki kemampuan malam.

Kondisi kemenangan:

> Jester menang jika berhasil membuat dirinya dieksekusi melalui voting desa.

Jika Jester terbunuh oleh Werewolf, kemenangan tidak berlaku.

---

# 7. Role Distribution

Bot menentukan komposisi role berdasarkan jumlah pemain.

Contoh:

| Players | Werewolf | Seer | Doctor | Hunter | Jester | Guardian | Witch | Villager |
| ------- | -------: | ---: | -----: | -----: | -----: | -------: | ----: | -------: |
| 5       |        1 |    1 |      1 |      0 |      0 |        0 |     0 |        2 |
| 6       |        1 |    1 |      1 |      1 |      0 |        0 |     0 |        2 |
| 7       |        2 |    1 |      1 |      1 |      0 |        0 |     0 |        2 |
| 8       |        2 |    1 |      1 |      1 |      1 |        0 |     0 |        2 |
| 9       |        2 |    1 |      1 |      1 |      1 |        1 |     0 |        2 |
| 10      |        3 |    1 |      1 |      1 |      1 |        1 |     0 |        2 |
| 11      |        3 |    1 |      1 |      1 |      1 |        1 |     1 |        2 |
| 12      |        3 |    1 |      1 |      1 |      1 |        1 |     1 |        3 |
| 13      |        3 |    1 |      1 |      1 |      1 |        1 |     1 |        4 |
| 14      |        3 |    1 |      1 |      1 |      1 |        1 |     1 |        5 |
| 15      |        3 |    1 |      1 |      1 |      1 |        1 |     1 |        6 |

Hunter mulai digunakan pada 6 pemain, Jester pada 8 pemain, Guardian pada 9 pemain,
dan Witch pada 11 pemain. Penambahan pemain dari komposisi 11 hingga batas 15
seluruhnya diisi oleh Villager.

Administrator nantinya dapat menggunakan custom role configuration.

---

# 8. Lobby System

Game dibuat melalui group WhatsApp.

Command:

```text
.ww create
```

Bot:

```text
🐺 WEREWOLF

Room berhasil dibuat!

Host:
@Roy

Players:
1. @Roy

Jumlah pemain:
1/15

Gunakan:
.ww join

untuk bergabung.

Host dapat memulai dengan:
.ww start
```

---

# 9. Join Game

Command:

```text
.ww join
```

Bot menambahkan sender ke lobby.

Validasi:

- User belum join
- Lobby tersedia
- Game belum berjalan
- Maximum player belum tercapai
- User tidak terdaftar dalam game Werewolf aktif di grup lain
- User pernah mengirim pesan ke bot melalui private chat

Untuk menandai private chat sebagai siap, pemain dapat mengirim:

```text
.ww ready
```

melalui private chat bot sebelum menjalankan `.ww join` di grup. Pesan privat lain
yang diterima bot juga dapat dicatat sebagai bukti bahwa user pernah menghubungi bot.

Response:

```text
✅ @Andi bergabung ke permainan.

Players: 6/15
```

---

# 10. Leave Game

Command:

```text
.ww leave
```

Hanya dapat dilakukan saat lobby.

Setelah game dimulai, pemain tidak dapat keluar menggunakan command biasa.

Jika pemain keluar dari grup saat permainan berlangsung:

```text
@Andi keluar dari grup.

Player dianggap meninggalkan permainan dan dieliminasi.
```

---

# 11. Start Game

Host menjalankan:

```text
.ww start
```

Validasi:

```text
players >= minimumPlayers
```

Default:

```text
minimumPlayers = 5
```

Bot kemudian:

1. Memastikan seluruh pemain mempunyai status private-chat ready
2. Mengacak dan menyimpan role setiap pemain
3. Mengirim informasi role melalui PM
4. Memulai Night 1 hanya jika seluruh role berhasil dikirim

Jika satu atau lebih role gagal dikirim, start dibatalkan dan room kembali ke lobby.
Seluruh assignment pada percobaan tersebut dianggap tidak valid. Ketika host mencoba
start lagi, semua role wajib diacak ulang dan pemain diberi tahu bahwa role dari
percobaan sebelumnya tidak berlaku.

Validasi ini diperlukan karena WhatsApp membatasi pengiriman pesan ke nomor yang
belum pernah berinteraksi dengan bot. Pemain wajib pernah mengirim pesan private agar
bot tidak memulai percakapan ke nomor baru atau anonim.

---

# 12. Role Assignment

Role wajib dikirim melalui private chat.

Contoh:

```text
🐺 WEREWOLF

Role kamu:

WEREWOLF

Faction:
Werewolf

Tujuan:
Habisi penduduk desa sampai jumlah Werewolf menguasai desa.

Teman Werewolf:

@Andi
@Budi

⚠️ Jangan tunjukkan pesan ini kepada pemain lain.
```

Seer:

```text
🔮 SEER

Kamu dapat mengetahui identitas satu pemain setiap malam.

Saat malam gunakan:

.ww inspect <nomor>
```

Doctor:

```text
💉 DOCTOR

Setiap malam kamu dapat menyelamatkan satu pemain.

Gunakan:

.ww heal <nomor>
```

Guardian:

```text
🛡️ GUARDIAN

Kamu mempunyai satu perlindungan untuk seluruh permainan.

Saat malam gunakan:
.ww guard <nomor>
```

Witch:

```text
🧙 WITCH

Kamu mempunyai satu Ramuan Racun dan satu Ramuan Ajaib.
Maksimal satu ramuan dapat digunakan setiap malam.

.ww potion poison <nomor>
.ww potion magic
```

---

# 13. Night Phase

Bot mengirim pesan:

```text
🌙 MALAM KE-1

Malam telah tiba.

Semua warga tertidur...

Role yang mempunyai kemampuan malam silakan mengecek private chat masing-masing.

⏱️ Night berakhir dalam 60 detik.
```

Status game:

```javascript
phase = 'NIGHT';
```

Bot mengirim action request kepada:

- Werewolf
- Seer
- Doctor
- Guardian jika skill belum digunakan
- Witch jika masih mempunyai ramuan

---

# 14. Night Action

Contoh Werewolf:

```text
🐺 Pilih target:

1. Roy
2. Andi
3. Siti
4. Budi

.ww kill 3
```

Seer:

```text
🔮 Siapa yang ingin kamu periksa?

.ww inspect 4
```

Doctor:

```text
💉 Siapa yang ingin kamu lindungi?

.ww heal 2
```

Guardian:

```text
🛡️ Siapa yang ingin kamu lindungi?

.ww guard 2
```

Witch:

```text
🧙 Pilih maksimal satu ramuan malam ini:

.ww potion poison 3
.ww potion magic
```

Night action harus dilakukan melalui private chat.

Saat menerima `.ww kill`, `.ww heal`, `.ww inspect`, `.ww guard`, `.ww potion`, atau `.ww shoot` melalui
private chat, bot mencari group game melalui indeks `senderJid → activeGroupJid`. Jika
tidak ada indeks, bot memberikan error umum. Payload command tidak boleh menerima
group JID dari user.

Jika user menjalankan command tersebut di grup:

```text
⚠️ Skill role harus dilakukan melalui private chat dengan bot.
```

---

# 15. Night Resolution

Bot tidak langsung mengeksekusi action.

Semua action dikumpulkan:

```javascript
nightActions = {
    werewolfVotes: [],
    doctorTarget: null,
    seerTarget: null,
    guardianTarget: null,
    witchAction: null,
};
```

Setelah timer selesai, bot menjalankan resolver.

Contoh:

```text
Werewolf target = Roy
Doctor target = Roy

Result:
Roy survives
```

Jika:

```text
Werewolf target = Roy
Doctor target = Andi

Result:
Roy dies
```

Urutan resolusi MVP:

1. Tentukan hasil vote Werewolf
2. Aktifkan Ramuan Ajaib jika dipilih
3. Aktifkan perlindungan Doctor dan Guardian
4. Terapkan serangan Werewolf
5. Terapkan Ramuan Racun
6. Kirim hasil investigasi Seer
7. Jalankan death trigger Hunter
8. Periksa kondisi kemenangan

Ramuan dan charge Guardian disimpan sebagai resource permanen di state pemain, bukan
hanya di `nightActions`, sehingga tidak kembali tersedia pada ronde berikutnya.

---

# 16. Morning Phase

Jika ada korban:

```text
☀️ PAGI TELAH TIBA

Warga menemukan seseorang tidak bernyawa...

💀 @Roy ditemukan tewas tadi malam.

Role:
Villager

Pemain tersisa:
8
```

Jika korban berhasil diselamatkan:

```text
☀️ PAGI TELAH TIBA

Malam terasa sangat mencekam...

Namun pagi ini tidak ada korban.

Semua warga masih hidup.
```

Jika Ramuan Ajaib digunakan, pengumuman berikut ditambahkan sebelum hasil korban:

```text
🧙 Penyihir telah menggunakan ramuan ajaibnya untuk melindungi warga desa.
```

Pengumuman tetap tampil meskipun Werewolf tidak berhasil menentukan target.

---

# 17. Discussion Phase

Setelah morning:

```text
💬 DISKUSI DIMULAI

Kalian mempunyai waktu 90 detik untuk mencari Werewolf.

Diskusikan siapa yang paling mencurigakan.

⏱️ 90 detik.
```

Status:

```javascript
phase = 'DISCUSSION';
```

Bot tidak perlu memblokir chat grup.

Setelah timer selesai:

```text
🗳️ WAKTU VOTING
```

---

# 18. Voting System

Bot menampilkan pemain hidup:

```text
🗳️ VOTING

Siapa yang ingin kalian eliminasi?

1. Roy
2. Andi
3. Budi
4. Siti
5. Dika

Gunakan:

.ww vote <nomor>

Contoh:
.ww vote 3

⏱️ Voting berakhir dalam 45 detik.
```

---

# 19. Voting Rules

Pemain:

- Hanya bisa vote jika masih hidup
- Tidak boleh vote pemain mati
- Hanya memiliki satu vote
- Bisa mengganti vote sebelum timer selesai

Contoh:

```text
.ww vote 3
```

Bot:

```text
✅ Vote kamu berhasil dicatat.
```

Vote tidak perlu langsung ditampilkan untuk mengurangi meta gaming.

---

# 20. Tie Voting

Jika terjadi hasil seri:

```text
🗳️ VOTING SERI

@Roy — 3 vote
@Andi — 3 vote

Tidak ada pemain yang dieliminasi hari ini.
```

Tidak ada revote pada MVP. Setelah hasil seri diumumkan, bot langsung mengecek
kondisi kemenangan lalu melanjutkan permainan ke malam berikutnya.

Jika vote rahasia Werewolf seri, tidak ada serangan Werewolf pada malam tersebut.

---

# 21. Elimination

Contoh:

```text
⚖️ HASIL VOTING

@Roy mendapatkan vote terbanyak.

Dengan keputusan desa...

@Roy dieksekusi.

Role:

🐺 WEREWOLF
```

Kemudian bot menjalankan:

```text
checkWinCondition()
```

---

# 22. Dead Player System

Pemain mati memiliki:

```javascript
alive = false;
```

Pemain mati:

- Tidak dapat vote
- Tidak dapat menggunakan skill
- Tidak dapat menjadi target
- Tetap dapat melihat permainan

Opsional:

```text
deadChatRestriction
```

Namun karena WhatsApp tidak memungkinkan bot membatasi chat individual secara mudah tanpa membuat grup terpisah, aturan komunikasi pemain mati bersifat sosial.

---

# 23. Win Condition

## Village Win

Jika:

```text
aliveWerewolves === 0
```

Bot:

```text
🎉 GAME OVER

Seluruh Werewolf berhasil dieliminasi!

🏡 VILLAGE MENANG!
```

---

## Werewolf Win

Jika:

```text
aliveWerewolves >= aliveNonWerewolves
```

`aliveNonWerewolves` mencakup seluruh Village dan Neutral yang masih hidup.

Bot:

```text
🐺 GAME OVER

Werewolf telah menguasai desa.

🌕 WEREWOLF MENANG!
```

---

## Jester Win

Jika:

```text
jester.eliminatedBy === "VOTE"
```

Bot:

```text
🤡 PLOT TWIST!

Kalian baru saja mengeksekusi Jester.

JESTER MENANG!
```

Pada MVP, eksekusi Jester melalui voting langsung mengakhiri pertandingan dengan
Jester sebagai pemenang tunggal. Jester yang mati karena serangan malam atau tembakan
Hunter tidak memenuhi kondisi kemenangan ini.

---

# 24. End Game Screen

Bot menampilkan semua role:

```text
╔══════════════════╗
      GAME OVER
╚══════════════════╝

🐺 WEREWOLF MENANG

Roles:

🐺 Roy — Werewolf
🐺 Andi — Werewolf
🔮 Siti — Seer
💉 Budi — Doctor
👨‍🌾 Raka — Villager
👨‍🌾 Dika — Villager

Duration:
18 menit

Rounds:
4

Thanks for playing 🐺
```

---

# 25. Command Structure

Main command:

```text
.ww
```

MVP tidak menggunakan alias command. Seluruh operasi wajib diawali `.ww` agar routing
game konsisten dan tidak menambah command global terpisah.

Sub-command:

```text
.ww create
.ww join
.ww leave
.ww start
.ww stop
.ww status
.ww players
.ww role
.ww ready
.ww tutor
.ww help
```

Game sub-command:

```text
.ww vote
.ww kill
.ww heal
.ww inspect
.ww guard
.ww potion
.ww shoot
```

---

# 26. Command Permissions

| Command | Semua User | Player | Host | Admin |
| ------- | ---------: | -----: | ---: | ----: |
| create  |         ✅ |     ✅ |   ✅ |    ✅ |
| join    |         ✅ |     ✅ |   ✅ |    ✅ |
| leave   |         ✅ |     ✅ |   ✅ |    ✅ |
| start   |         ❌ |     ❌ |   ✅ |    ✅ |
| stop    |         ❌ |     ❌ |   ✅ |    ✅ |
| vote    |         ❌ |     ✅ |   ✅ |    ✅ |
| guard   |         ❌ |     ✅ |   ✅ |    ✅ |
| potion  |         ❌ |     ✅ |   ✅ |    ✅ |
| status  |         ✅ |     ✅ |   ✅ |    ✅ |
| role    |         ❌ |     ✅ |   ✅ |    ✅ |
| ready   |         ✅ |     ✅ |   ✅ |    ✅ |
| tutor   |         ✅ |     ✅ |   ✅ |    ✅ |

---

# 27. Game State

Game mempunyai state:

```javascript
const GAME_PHASES = Object.freeze([
    'LOBBY',
    'ROLE_ASSIGNMENT',
    'NIGHT',
    'MORNING',
    'DISCUSSION',
    'VOTING',
    'HUNTER_SHOT',
    'RESOLUTION',
    'ENDED',
]);
```

---

# 28. Player Model

Contoh data:

```javascript
const player = {
    jid: '628xxx@s.whatsapp.net',
    name: 'Roy',
    role: 'SEER',
    faction: 'VILLAGE',
    alive: true,
    joinedAt: Date.now(),
    dmReadyAt: Date.now(),
    voteTarget: null,
    nightAction: null,
    roleState: {
        guardianAvailable: true,
        witchPoisonAvailable: true,
        witchMagicAvailable: true,
        witchPotionUsedRound: null,
    },
};
```

`roleState` hanya menyimpan resource yang relevan dengan role pemain. Field Guardian
dan Witch di atas ditampilkan bersama untuk mendokumentasikan bentuk resource MVP.

---

# 29. Game Model

```javascript
const game = {
    id: 'game-id',
    groupJid: '123@g.us',
    hostJid: '628xxx@s.whatsapp.net',
    phase: 'LOBBY',
    round: 0,
    players: [],
    createdAt: Date.now(),
    phaseStartedAt: null,
    timers: {
        night: null,
        discussion: null,
        voting: null,
        hunterShot: null,
    },
    transitionLock: false,
    phaseVersion: 0,
    settings: {},
};
```

---

# 30. Game Settings

Default:

```javascript
{
  minPlayers: 5,
  maxPlayers: 15,

  nightDuration: 60,
  discussionDuration: 90,
  votingDuration: 45,
  hunterShotDuration: 30,

  revealRoleOnDeath: true,

  doctorSelfHeal: true,
  doctorRepeatTarget: false
}
```

---

# 31. Architecture

Rekomendasi struktur:

```text
src/
│
├── games/
│   └── werewolf/
│       │
│       ├── WerewolfGame.js
│       ├── GameManager.js
│       ├── GameState.js
│       │
│       ├── roles/
│       │   ├── Role.js
│       │   ├── Villager.js
│       │   ├── Werewolf.js
│       │   ├── Seer.js
│       │   ├── Doctor.js
│       │   ├── Guardian.js
│       │   ├── Witch.js
│       │   ├── Hunter.js
│       │   └── Jester.js
│       │
│       ├── phases/
│       │   ├── LobbyPhase.js
│       │   ├── NightPhase.js
│       │   ├── MorningPhase.js
│       │   ├── DiscussionPhase.js
│       │   ├── VotingPhase.js
│       │   └── HunterShotPhase.js
│       │
│       ├── engine/
│       │   ├── RoleManager.js
│       │   ├── ActionResolver.js
│       │   ├── VoteManager.js
│       │   └── WinCondition.js
│       │
│       └── utils/
│           ├── roleDistribution.js
│           └── gameMessage.js
│
└── plugins/
    └── werewolf.js
```

---

# 32. GameManager

GameManager menyimpan game berdasarkan group JID.

```javascript
class GameManager {
    #games = new Map();
    #playerGames = new Map();

    create(groupJid) {}

    get(groupJid) {}

    delete(groupJid) {}

    exists(groupJid) {}

    getByPlayer(playerJid) {}

    registerPlayer(playerJid, groupJid) {}

    unregisterPlayer(playerJid) {}
}
```

Satu grup hanya boleh mempunyai satu active game. `#playerGames` menjadi indeks
`playerJid → groupJid` untuk mengarahkan command rahasia dari private chat ke game
yang benar. Registrasi ditolak jika player JID sudah terikat ke game aktif lain.

```text
groupJid
    ↓
GameManager
    ↓
WerewolfGame

playerJid
    ↓
playerGames index
    ↓
groupJid
```

---

# 33. Role System

Role menggunakan object contract agar mudah menambah role baru di JavaScript ESM.

```javascript
const role = {
    id: 'seer',
    name: 'Seer',
    faction: 'VILLAGE',
    description: 'Memeriksa satu pemain setiap malam.',
    hasNightAction: true,
    async performAction(game, player, target) {},
};
```

Dengan desain ini nantinya bisa ditambahkan:

```text
Cupid
Mayor
Necromancer
Alpha Wolf
Wolf Seer
Serial Killer
Arsonist
Executioner
Survivor
Vampire
```

tanpa mengubah core game engine.

---

# 34. Action Resolver

Semua night action diproses oleh satu resolver.

Prioritas contoh:

```text
1. Role Block
2. Global Protection (Witch Magic)
3. Individual Protection (Doctor / Guardian)
4. Werewolf Attack
5. Witch Poison
6. Investigation
7. Death Trigger
8. Resurrection
9. Win Check
```

Ini penting ketika role semakin banyak.

Contoh:

```javascript
await resolver.resolve(game);
```

---

# 35. Timer System

Bot wajib memiliki timer otomatis.

Contoh:

```text
Night
60 seconds

Discussion
90 seconds

Voting
45 seconds
```

Pada 10 detik terakhir:

```text
⏱️ 10 detik tersisa!
```

Setelah timer habis:

```javascript
advancePhase();
```

Setiap perpindahan fase wajib melewati satu fungsi transisi atomic. Fungsi tersebut:

1. Memeriksa `phase` dan `phaseVersion` yang diharapkan
2. Menolak eksekusi jika `transitionLock` sedang aktif
3. Mengaktifkan lock sebelum proses asynchronous dimulai
4. Membersihkan timer fase lama dan menaikkan `phaseVersion`
5. Memindahkan fase tepat satu kali, lalu melepas lock dalam blok `finally`

Dengan aturan ini, action terakhir dan callback timeout yang tiba bersamaan tidak dapat
menyelesaikan fase yang sama dua kali.

---

# 36. AFK System

Pemain yang tidak melakukan action tidak menghentikan permainan.

Night action:

```text
No action = SKIP
```

Voting:

```text
No vote = Abstain
```

Future version dapat memiliki AFK strike:

```text
AFK 3 phase
↓
Auto elimination
```

---

# 37. Disconnect Handling

Karena WhatsApp tidak menggunakan koneksi game secara langsung, disconnect tidak mempengaruhi state.

Namun bot perlu menangani:

- Bot restart
- Process crash
- Server restart

Untuk production, game state sebaiknya disimpan menggunakan Redis atau database.

---

# 38. Storage Strategy

Untuk MVP:

```text
Memory
```

Contoh:

```javascript
const gamesByGroup = new Map();
const activeGameByPlayer = new Map();
```

Kedua indeks wajib diperbarui secara atomic saat join, leave lobby, game selesai,
game dibatalkan, atau game dihentikan.

Production:

```text
Redis
```

Persistence:

```text
PostgreSQL
```

Redis digunakan untuk:

- Active game
- Current phase
- Timers
- Night actions
- Vote state

PostgreSQL digunakan untuk:

- Player statistics
- Match history
- Achievement
- Ranking
- XP

---

# 39. Database Schema

## users

```text
id
jid
name
xp
level
games_played
wins
losses
created_at
updated_at
```

## games

```text
id
group_jid
winner
rounds
started_at
ended_at
```

## game_players

```text
id
game_id
user_id
role
faction
result
survived
```

---

# 40. Player Statistics

Command:

```text
.ww stats
```

Response:

```text
🐺 WEREWOLF PROFILE

Roy

🎮 Games: 42
🏆 Wins: 25
💀 Losses: 17

Win Rate:
59.5%

Favorite Role:
🐺 Werewolf

Kills:
18

Correct Votes:
31
```

---

# 41. XP System

Contoh XP:

```text
Play game       +10 XP
Win game        +20 XP
Survive game    +5 XP
Correct vote    +3 XP
Successful kill +3 XP
```

Level:

```text
Level 1
↓
Level 2
↓
Level 3
...
```

XP dan level bukan bagian critical MVP tetapi struktur database harus siap.

---

# 42. Anti-Cheat

Bot tidak dapat sepenuhnya mencegah pemain melakukan screenshot atau berkomunikasi melalui private chat.

Namun beberapa exploit dapat dicegah.

Bot wajib memastikan:

```text
Role command hanya melalui PM
```

Bot tidak boleh memberi response berbeda di group berdasarkan role.

Contoh salah:

```text
❌ Kamu bukan Werewolf.
```

Response seperti itu dapat membocorkan role.

Gunakan response umum:

```text
⚠️ Command tersebut tidak dapat digunakan saat ini.
```

---

# 43. Security

Semua game action harus memvalidasi:

```text
sender
group
game
player
alive
phase
role
target
```

Contoh:

```javascript
if (!player.alive) return;

if (game.phase !== 'NIGHT') return;

if (player.role !== 'SEER') return;
```

Jangan menerima player identity dari payload command tanpa mengecek sender WhatsApp.

---

# 44. Race Condition

WhatsApp message dapat masuk hampir bersamaan.

Action harus bersifat atomic.

Contoh vote:

```javascript
voteManager.setVote(playerId, targetId);
```

Tidak:

```javascript
votes.push(...)
```

tanpa memastikan vote lama sudah dihapus.

Phase transition juga harus bersifat idempotent. Callback timer membawa
`expectedPhase` dan `expectedPhaseVersion`; callback menjadi no-op jika state game
sudah berubah akibat action pemain.

---

# 45. Restart Recovery

Production requirement:

Jika bot restart ketika game berjalan:

```text
Bot Restart
    ↓
Read active games from Redis
    ↓
Calculate remaining phase time
    ↓
Restore timer
    ↓
Continue game
```

Jika recovery gagal:

```text
⚠️ Game dihentikan karena sistem mengalami restart dan game state tidak dapat dipulihkan.
```

---

# 46. Message UX

Bot sebaiknya menggunakan pesan singkat tetapi dramatis.

Night:

```text
🌙 Malam telah tiba...

Desa kembali sunyi.

Namun di tengah kegelapan...

🐺 sesuatu sedang berburu.
```

Morning:

```text
☀️ Matahari mulai terbit.

Penduduk mulai keluar dari rumah masing-masing...
```

Voting:

```text
⚖️ Waktunya menentukan nasib seseorang.
```

Tujuannya membuat pengalaman terasa seperti game, bukan sekadar command bot.

---

# 47. Error Handling

Player belum join:

```text
❌ Kamu bukan bagian dari permainan ini.
```

Game belum ada:

```text
❌ Tidak ada game Werewolf aktif.

Gunakan:

.ww create
```

Lobby penuh:

```text
❌ Lobby sudah penuh.

Maximum player:
15
```

Game berjalan:

```text
❌ Permainan sudah dimulai.

Tunggu sampai game selesai.
```

---

# 48. Host Controls

Host dapat menjalankan:

```text
.ww start
.ww stop
.ww settings
.ww kick
```

Contoh:

```text
.ww kick @Roy
```

`.ww settings` dan `.ww kick` hanya dapat digunakan saat lobby. `.ww start` hanya
berlaku ketika lobby memenuhi syarat jumlah pemain.

Saat game sudah berjalan, `.ww stop` tidak langsung menghentikan game. Bot mengirim
permintaan konfirmasi yang hanya berlaku selama 30 detik:

```text
.ww stop confirm
```

Hanya host yang sama dapat mengonfirmasi. Tanpa konfirmasi, game tetap berjalan.
Saat lobby, host boleh menghentikan room tanpa konfirmasi.

---

# 49. Admin Controls

Group admin dapat force-stop game:

```text
.ww force-stop
```

Response:

```text
⚠️ GAME DIHENTIKAN

Permainan dihentikan oleh administrator.
```

Admin juga dapat memindahkan ownership lobby jika host keluar.

---

# 50. Custom Game — Future

Host dapat memilih role.

Contoh:

```text
.ww mode custom
```

Kemudian:

```text
.ww role add seer
.ww role add doctor
.ww role add hunter
.ww role add jester
```

Bot memastikan:

```text
totalRoles === players
```

---

# 51. Game Modes

Future version:

### Classic

```text
Villager
Werewolf
Seer
Doctor
```

### Chaos

Banyak special role.

### Quick

Timer lebih pendek.

```text
Night: 30 sec
Discussion: 45 sec
Voting: 20 sec
```

### Anonymous Role

Role pemain mati tidak ditampilkan.

### Ranked

Game mempengaruhi MMR.

---

# 52. Ranking

Future:

```text
.ww leaderboard
```

Response:

```text
🏆 WEREWOLF LEADERBOARD

1. Roy
   1,824 MMR

2. Andi
   1,751 MMR

3. Budi
   1,690 MMR
```

---

# 53. Achievement System

Contoh:

```text
🐺 Alpha Predator
Menang sebagai Werewolf 10x

🔮 Third Eye
Berhasil menemukan Werewolf 5x sebagai Seer

💉 Guardian Angel
Berhasil menyelamatkan korban Werewolf 5x

🤡 Master Troll
Menang sebagai Jester 3x
```

---

# 54. MVP Scope

Fitur yang wajib tersedia pada versi pertama:

- Create room
- Join lobby
- Leave lobby
- Start game
- Random role
- Private role notification
- Werewolf
- Villager
- Seer
- Doctor
- Guardian
- Witch
- Night phase
- Werewolf kill
- Seer investigation
- Doctor protection
- Guardian one-time protection
- Witch poison dan global Village protection
- Morning result
- Discussion timer
- Voting
- Elimination
- Win detection
- Hunter dan fase last shot
- Jester dan kemenangan melalui voting
- Stop game dengan konfirmasi saat permainan berjalan
- Indeks player JID ke active group game
- Validasi private-chat ready sebelum start
- Phase transition lock dan idempotent timer
- Basic game state
- Error handling

---

# 55. V1.1

Setelah MVP stabil:

- AFK system
- Match history
- Player stats
- XP
- Leaderboard
- Game settings
- Custom timer
- Redis persistence

---

# 56. V2

Advanced version:

- 20+ roles
- Ranked matchmaking
- MMR
- Seasons
- Achievements
- Daily missions
- Economy
- Shop
- Cosmetics
- Player titles
- Custom role composition
- Spectator mode
- Replay
- Tournament system

---

# 57. Non-Functional Requirements

### Performance

Bot harus mampu menangani minimal:

```text
100 active game
```

secara bersamaan.

Jika rata-rata:

```text
10 player/game
```

maka sekitar:

```text
1,000 simultaneous players
```

harus dapat dikelola tanpa game engine saling memblokir.

### Reliability

Action player tidak boleh hilang akibat asynchronous event.

### Scalability

Game engine harus stateless sebisa mungkin dan menyimpan transient state ke Redis jika berjalan dengan multi-instance bot.

---

# 58. Recommended Tech Stack

Backend:

```text
Node.js
JavaScript ESM
```

WhatsApp:

```text
Baileys / compatible WhatsApp client
```

Runtime game:

```text
Node.js
```

Active game state:

```text
Redis
```

Persistent database:

```text
PostgreSQL
```

ORM:

```text
Prisma / Drizzle
```

Schema validation:

```text
Zod
```

Logging:

```text
Pino
```

Testing:

```text
Vitest
```

---

# 59. Core Architecture

Arsitektur yang direkomendasikan:

```text
WhatsApp
   │
   ▼
Message Handler
   │
   ▼
Command Router
   │
   ▼
Werewolf Plugin
   │
   ▼
GameManager
   │
   ├── Lobby Manager
   ├── Phase Manager
   ├── Role Manager
   ├── Action Resolver
   ├── Vote Manager
   └── Win Condition
           │
           ▼
       Game State
           │
     ┌─────┴──────┐
     ▼            ▼
   Redis      PostgreSQL
```

---

# 60. Design Principle

Game engine tidak boleh bergantung langsung pada implementasi WhatsApp.

Hindari:

```javascript
class WerewolfGame {
  async kill() {
    await whatsapp.sendMessage(...)
  }
}
```

Lebih baik:

```javascript
const event = game.kill(...);

eventBus.emit(event);
```

Kemudian adapter WhatsApp menangani output.

```text
Game Engine
    ↓
Game Event
    ↓
WhatsApp Adapter
    ↓
sendMessage()
```

Dengan cara ini game engine nantinya dapat digunakan kembali untuk:

- WhatsApp
- Discord
- Telegram
- Website
- REST API

tanpa menulis ulang seluruh logic Werewolf.

---

# 61. Acceptance Criteria MVP

MVP dianggap selesai apabila:

- Lima atau lebih pemain dapat membuat game dari satu grup WhatsApp.
- Setiap pemain menerima role secara private.
- Start dibatalkan jika salah satu role gagal dikirim dan retry mengacak ulang role.
- Role pemain lain tidak bocor melalui response bot.
- Werewolf dapat memilih korban.
- Doctor dapat melindungi pemain.
- Seer dapat melakukan investigasi.
- Guardian dapat melindungi satu pemain pada satu malam dan skill tidak dapat dipakai
  kembali setelah dikonsumsi.
- Witch mempunyai dua ramuan sekali pakai dan hanya dapat menggunakan satu ramuan
  per malam.
- Ramuan Racun dapat membunuh target valid dan Ramuan Ajaib membatalkan serangan
  Werewolf terhadap seluruh pemain Village pada malam tersebut.
- Penggunaan Ramuan Ajaib diumumkan di grup tanpa membocorkan identitas Witch.
- Hunter dapat menggunakan tembakan terakhir setelah mati.
- Jester menang hanya jika dieksekusi melalui voting desa.
- Semua night action diproses secara konsisten.
- Bot dapat berpindah Night → Morning → Discussion → Voting secara otomatis.
- Pemain mati tidak dapat melakukan action.
- Voting hanya menerima pemain yang valid.
- Voting seri tidak mengeliminasi pemain dan game berlanjut ke malam berikutnya.
- Bot dapat menentukan kemenangan Village atau Werewolf.
- Game dapat selesai tanpa intervensi moderator.
- Satu grup tidak dapat menjalankan dua game sekaligus.
- Satu pemain tidak dapat mengikuti dua game Werewolf aktif sekaligus.
- Game lain di grup berbeda tidak saling mempengaruhi.
- Action terakhir dan timeout yang bersamaan tidak menggandakan transisi fase.
- Host harus mengonfirmasi sebelum menghentikan game yang sedang berjalan.
- Error atau command invalid tidak menyebabkan bot/game crash.

---

# 62. Definition of Done

Werewolf WhatsApp Bot V1 dianggap siap digunakan ketika satu sesi lengkap dapat berjalan:

```text
CREATE
   ↓
JOIN
   ↓
START
   ↓
ROLE ASSIGNMENT
   ↓
NIGHT
   ↓
ACTIONS
   ↓
MORNING
   ↓
DISCUSSION
   ↓
VOTING
   ↓
ELIMINATION
   ↓
WIN CHECK
   ↓
REPEAT / GAME OVER
```

tanpa membutuhkan moderator manusia dan seluruh secret information hanya dikirim melalui private chat pemain.
