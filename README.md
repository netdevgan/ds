# DigitalTime World Cup 2026

Jadwal, hasil, dan klasemen Piala Dunia 2026 — otomatis, live, SEO-friendly.

## Stack

- **Hosting:** Cloudflare Pages (gratis)
- **Backend API:** Cloudflare Workers (serverless, gratis 100k req/hari)
- **Cache:** Cloudflare KV (gratis)
- **Data source:** TheSportsDB (gratis, tanpa API key publik)
- **Frontend:** HTML + CSS + JavaScript vanilla

## Cara Deploy

### 1. Clone / upload project ini ke GitHub

Buat repo baru di GitHub, upload semua file ini.

### 2. Buat KV Namespace di Cloudflare

1. Buka [Cloudflare Dashboard](https://dash.cloudflare.com/) → Workers & Pages → KV
2. Klik **Create namespace**
3. Beri nama: `WORLDCUP_KV`
4. Catat **Namespace ID** (bentuk UUID)

### 3. Deploy ke Cloudflare Pages

1. Dashboard → Workers & Pages → Pages → **Create a project** → **Connect to Git**
2. Pilih repo yang sudah di-upload
3. **Build settings:**
   - Framework preset: **None**
   - Build command: (kosongkan)
   - Build output directory: (biarkan kosong, root)
4. **Environment variables (advanced):**
   - Tambahkan: `TSDB_KEY = 3` (atau API key pribadimu dari TheSportsDB)
5. Klik **Save and Deploy**

### 4. Bind KV ke Pages Function

1. Setelah deploy pertama selesai, buka project Pages-mu
2. **Settings** → **Functions** → **KV namespace bindings**
3. Klik **Add binding**
4. Variable name: `WORLDCUP_KV`
5. KV namespace: pilih yang sudah dibuat tadi
6. Klik **Save**

### 5. (Opsional) Hubungkan domain `digitaltime.store`

1. Settings → **Custom domains** → **Set up a custom domain**
2. Masukkan `digitaltime.store` (atau subfolder via redirect)
3. Ikuti petunjuk DNS

### 6. Update canonical & OG URL

Edit `index.html`:
- Ganti `https://digitaltime.store/` dengan URL deploymu
- Jika deploy di subfolder `/worldcup/`, update `canonical` dan `og:url`

## Struktur File

```
├── index.html            # Halaman utama (SEO-optimized)
├── _redirects            # Aturan redirect Cloudflare Pages
├── wrangler.toml         # Konfigurasi Workers + KV
├── assets/
│   ├── style.css         # Style modern, dark mode
│   ├── app.js            # Interaktivitas, fetch API, render
│   └── favicon.svg       # Ikon situs
└── functions/
    └── api/
        ├── health.js     # Health check endpoint
        ├── matches.js    # Jadwal & hasil pertandingan
        ├── standings.js  # Klasemen grup
        └── teams.js      # Daftar tim peserta
```

## API Endpoint

| Endpoint | Deskripsi |
|---|---|
| `GET /api/health` | Status API + KV |
| `GET /api/matches` | Semua jadwal (query: `?filter=upcoming\|finished\|live&group=A`) |
| `GET /api/standings` | Klasemen grup (query: `?group=A`) |
| `GET /api/teams` | Daftar tim peserta |

## Catatan

- Data bersumber dari TheSportsDB (API publik). Jika ingin data lebih akurat, daftar API key sendiri gratis di [thesportsdb.com](https://www.thesportsdb.com/free_api.php).
- Cache KV: matches 30 menit, standings 2 jam, teams 24 jam.
- Auto-refresh di frontend setiap 5 menit.
- Tidak menyediakan live streaming. Hanya informasi jadwal & hasil.
