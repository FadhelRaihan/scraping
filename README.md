# ProjectAdmin

## Template pesan dan WhatsApp manual

Menu `/templates` menyediakan beberapa template kosong buatan pengguna, edit, aktif/nonaktif, serta hapus permanen dengan konfirmasi. Variabel yang tersedia: `{{nama}}`, `{{kategori}}`, `{{kota}}`, `{{rating}}`, `{{website}}`. Maksimum isi template 2.000 karakter, hasil render 4.000 karakter.

Di detail lead, pilih template lalu Preview pesan. Buka WhatsApp membuka `wa.me`; pengguna mengirim pesan sendiri. Centang konfirmasi pengiriman lalu Tandai sudah dihubungi untuk menyimpan histori. Nomor valid tidak menjamin nomor terdaftar WhatsApp. Aplikasi tidak mengetahui delivery/read.

Snapshot preview ditandatangani server dan berlaku 24 jam. Nama template, pesan dan nomor pada histori tidak berubah ketika template diedit/dihapus. Pengulangan konfirmasi preview sama tidak membuat histori ganda. Status new/qualified menjadi contacted; status pipeline lebih lanjut tetap dipertahankan. Opt-out memblokir preview/konfirmasi berikutnya pada lead tersebut. Filter Riwayat kontak tersedia di database lead.

Migrasi: `npm run db:migrate`. Penghapusan template memakai `ON DELETE SET NULL`, bukan menghapus histori kontak.

## Sprint 4 — Konfigurasi dari website

Halaman Scraping menyediakan durasi 0,25–24 jam (kelipatan 15 menit), pilihan 27 wilayah dan enam kategori, mode resume/new, preview query dan konfirmasi arsip. Resume mengunci wilayah/kategori checkpoint; durasi dapat diubah. Sesi baru membutuhkan persetujuan sebelum mulai.

Backend memvalidasi ulang payload dan menyimpan config_snapshot sebelum worker dibuat. Worker membaca konfigurasi yang sama, memeriksa kecocokan checkpoint di bawah session lock. Sesi baru menyalin checkpoint/CSV/ledger ke `data/archive/<timestamp>-<uuid>` sebelum mengganti antrean. Profil browser, histori, data DB dan ledger aktif dipertahankan. Salinan arsip tidak dihapus otomatis. Kombinasi query bukan perkiraan jumlah bisnis.

Tes: `node --test apps/scraper/config.test.js`. Restart `npm run dev` setelah update. Tidak memerlukan migrasi baru jika migrasi Sprint 3 telah dijalankan.

## Sprint 3 — Histori dan coverage

Jalankan `npm run db:migrate`, restart aplikasi. Menu Histori & Coverage menyediakan `/scraping/history`, `/scraping/coverage`, `/scraping/compare`, serta ekspor CSV. Detail histori mulai direkam pada job baru; data job lama tidak direkonstruksi.

Query menyimpan status, waktu, scroll, jumlah tempat unik terlihat dan reached_end. Empat scroll stagnan menghasilkan incomplete, bukan completed. Place per job menyimpan seluruh query penemunya dan snapshot saat diproses. Tempat pending dari checkpoint dapat diproses tanpa tanggal discovery baru. Snapshot historis tidak mengambil nilai lead saat ini.

Histori disimpan atomik di `data/history-<id>.json` sebelum worker menyalinkannya ke DB melalui heartbeat. Coverage wilayah adalah jumlah observasi query, bukan jumlah unik wilayah atau persentase seluruh bisnis. Compare menggunakan place_key checkpoint: new/returning/changed/missing_from_latest. Missing bukan bukti tutup. Sesi berbeda cakupan tidak dapat dianggap sensus sebanding. Snapshot tidak tersedia bila tempat hanya ditemukan tanpa diproses ulang.

Konfigurasi query masih kota/kabupaten. Ekspansi semua kecamatan dan pengaturan wilayah tetap ditunda sesuai rencana terakhir.

## Sprint 2 — Kualitas metadata

Metadata disimpan di `leads.quality` (JSONB berindeks), mempertahankan kolom dan checkpoint lama. Migrasi `002_quality_fields.sql` serta backfill dijalankan melalui `npm run db:migrate`. Backfill hanya menurunkan informasi yang sudah tersedia, tidak mengambil ulang profil Maps.

Detail lead memiliki panel Kualitas data: presisi tanggal, jumlah ulasan, kategori Maps/pencarian, telepon standar, status website, operasional, jam buka dan koordinat. Ekspor CSV menyertakan kolom JSON `quality`.

Tanggal absolut diterima jika atribut tanggal review menyediakannya; teks relatif tidak dipalsukan menjadi tanggal pasti. Place ID `ChIJ...` terpisah dari feature ID `0x...`; fallback checkpoint lama tetap digunakan. Telepon Indonesia dinormalisasi ke `+62`, ekstensi ambigu tetap hanya raw. Normalisasi URL mempertahankan path dan query, membuang fragment; tidak mengakses situs bisnis. Status tutup permanen/sementara berbeda dari sedang tutup di luar jam buka.

API filter tambahan: `precision`, `website_status`, `operational`, `min_reviews`, `maps_category`. Metadata kosong berarti belum tersedia. Selector metadata Maps masih perlu diverifikasi terhadap sesi Maps pengguna.

## Sprint 1 — Stabilitas

Roadmap lanjutan tersimpan di `ROADMAP.md`.
Sync dipicu 25 hasil tertunda atau 30 detik pada checkpoint berikutnya; finalisasi memberi budget 10 detik. Pengiriman tetap serial per lead; belum memakai endpoint batch. Ledger acknowledgement disimpan atomik, `sync.lock` mencegah penulis bersamaan. HTTP sementara memakai backoff 2/5/15/60 detik dan menghormati Retry-After. Finalisasi tidak melewati Retry-After; hasil tersisa dilanjutkan lewat sync/sesi berikutnya.

Payload permanen bermasalah dicatat di `data/sync-rejected.json` dan tidak menghalangi hasil lain. Perubahan payload mengaktifkan percobaan kembali. API key invalid menghentikan operasi. `npm run sync` memberi kode keluar nonzero jika ada pending/rejected/lock.

Progress worker sekarang menghitung tempat yang diproses dalam job, bukan total checkpoint. `progress.outcomes` memuat recent/old/unknown/outside_region/error; `progress.sync` memuat pending, imported dan rejected. Angka imported adalah upsert yang diakui API, termasuk pembaruan lead lama. Screenshot diagnostik dan metadata terbatas disimpan di `data/diagnostics/<job-id>`; tidak menyimpan HTML, cookie atau storage browser. Periksa screenshot sebelum membagikannya karena konten akun yang terlihat dapat ikut tertangkap.

Pemeriksaan tambahan: `node --test apps/scraper/reliability.test.js`.

## Halaman dan kontrol scraping

- `/overview`: ringkasan data dan aktivitas terakhir.
- `/leads`: database lead, filter, detail, catatan, histori, ekspor.
- `/web-opportunities`: lead yang belum mencantumkan website.
- `/scraping`: Mulai/Hentikan Scraping, status, heartbeat, progress dan 150 log terakhir.

UI memakai komponen shadcn/ui resmi (Radix), Tailwind, React Router. Identitas aplikasi generik; konfigurasi scraper tetap enam keyword dan 27 wilayah yang sebelumnya disepakati.

Setelah update jalankan `npm install`, `npm run db:migrate`, lalu restart `npm run dev`.

Worker scraping berjalan terpisah dari backend, memiliki advisory lock PostgreSQL, job persisten, dan heartbeat setiap 3 detik. Refresh/menutup tab tidak menghentikan worker. Backend restart tidak kehilangan monitoring; status dibaca dari DB. Stop dikirim melalui DB agar bekerja di Windows tanpa bergantung pada SIGTERM antarproses. Worker menutup browser dan menyimpan checkpoint. DB putus memicu penghentian worker. Job tanpa lock dan heartbeat lebih dari 2 menit ditandai gagal saat status dibaca. Job dengan lock aktif tetap ditampilkan tertahan, bukan dianggap selesai.

Tidak ada pembunuhan PID otomatis: PID bisa dipakai ulang OS. Jika worker tidak merespons stop, periksa proses Node/Chromium di Task Manager; jangan hapus `data/session.lock` sebelum memastikan scraper berhenti. Konfigurasi default durasi 4,5 jam, serial, melanjutkan checkpoint. Jumlah progress adalah total checkpoint, bukan jumlah baru per job. API tidak otomatis memulai scraping saat dibuka.

## Dashboard MVP

React + Vite, Fastify, PostgreSQL lokal melalui Docker. Satu admin; login cookie HttpOnly, password hash scrypt. Database menyimpan lead, catatan, status, dan histori. SQL parameterized langsung, tanpa ORM. Grafik memakai CSS, tanpa library chart.

### Setup pertama

Jalankan dari root repository, dengan Docker Desktop aktif:

```powershell
npm install
npm run setup
npm run db:up
npm run db:migrate
npm run dev
```

`setup` meminta email, menghasilkan password admin acak (simpan saat ditampilkan), lalu membuat `.env`. File yang sudah ada tidak ditimpa. Buka **http://127.0.0.1:5173**, gunakan email/password tersebut. Gunakan `127.0.0.1`, bukan `localhost`, sesuai `APP_ORIGIN`. API berjalan di port 3001. Tombol Refresh memperbarui statistik dan tabel.

Di terminal kedua:

```powershell
npm run sync
# atau jalankan scraping baru, sekaligus sinkronisasi:
npm run scrape
```

`sync` mengimpor hasil valid dari `data/state.json` yang sudah ada. `scrape` menyimpan checkpoint dahulu, lalu menyinkronkan hasil ke API. `data/synced.json` mencatat hash hasil yang sudah terkirim. API gagal: data tetap di checkpoint, dicoba lagi paling cepat 60 detik saat scraping atau melalui `npm run sync`. Jangan menjalankan `sync` bersamaan dengan `scrape`. Jika memindahkan ke DB kosong, arsipkan `data/synced.json` agar semua hasil dikirim ulang.

### Fitur

- Ringkasan total, baru, tanpa website, deal; distribusi kota, rating, pipeline.
- Search nama/alamat, filter wilayah/kategori/status/website/telepon/rating/tanggal scraping.
- Sorting dan pagination 25 lead, ekspor seluruh hasil filter (bukan hanya halaman aktif).
- Detail bisnis, tautan Maps/website, catatan, perubahan status manual dan histori.
- Upsert dengan kunci tempat Maps (ID internal yang ditemukan di URL, atau URL kanonis sebagai fallback); data lama tidak menimpa hasil scraping yang lebih baru. Status/catatan tidak disentuh ingest.
- Wilayah diambil dari alamat. Alamat yang tidak menyebut kota/kabupaten diberi wilayah belum teridentifikasi. Label kategori berasal dari pencarian, bukan klasifikasi terverifikasi.

“Tanpa website” berarti **website belum tercantum di hasil Maps**, bukan bukti bisnis tidak mempunyai website. Tanggal ulasan relatif ditampilkan sesuai waktu scraping; tidak dibuat menjadi tanggal pasti. Database historis tidak otomatis menghapus lead ketika data menua.

### Build dan pemeriksaan

```powershell
npm test
npm run build
npm run test:integration
```

Tes integrasi membutuhkan DB aktif dan build frontend. Membuat schema acak sementara, menguji API serta Chromium, lalu membersihkan schema miliknya. Tidak memasukkan data contoh ke database utama.

Untuk menjalankan build tanpa Vite:

```powershell
$env:APP_ORIGIN="http://127.0.0.1:3001"
npm run serve
```

Sesi login kedaluwarsa setelah 12 jam atau restart backend. `.env`, profil browser, dan data lokal jangan dibagikan. PostgreSQL persisten di volume Docker; menghentikan container tidak menghapus lead. Jika port 5432 terpakai, sesuaikan port Compose dan `DATABASE_URL`.

### Struktur

```text
apps/backend/     API, schema SQL, pemeriksaan integrasi
apps/frontend/    Dashboard React
apps/scraper/     Scraper dan sinkronisasi
scripts/          Setup dan development launcher
data/             Checkpoint, CSV, profil browser (diabaikan Git)
```

`scraper.js` dan `review.js` di root merupakan entrypoint kompatibilitas. Perintah `npm start` lama tetap bekerja tanpa mewajibkan backend; gunakan `npm run scrape` untuk memuat konfigurasi `.env` dan auto-sync.

## Scraper

Node.js 20+, Playwright, satu tab. Enam keyword × 27 kota/kabupaten. Kota besar lebih dahulu. Menemukan tempat lalu memproses detailnya sebelum pencarian berikutnya.

## Jalankan (PowerShell)

```powershell
npm install
npx playwright install chromium
npm test
npm start
```

Default browser terlihat, durasi maksimum 4,5 jam per sesi termasuk pencarian. `Ctrl+C` menyimpan sesi. Jalankan kembali untuk melanjutkan antrean. Deadline menutup browser; tempat yang belum selesai tetap pending.

Jika muncul `LIMITED_VIEW`, Google tidak menyediakan tab ulasan pada sesi tersebut. Jalankan `npm run browser`, periksa akses Maps secara manual (login jika diperlukan), tutup browser sebelum `npm start`. Profil disimpan lokal di `data/browser-profile`; jangan dibagikan karena dapat berisi sesi login. Login tidak menjamin pembatasan hilang. Scraper berhenti selama ulasan tidak tersedia; item tetap pending.

```powershell
$env:HOURS="5"
$env:HEADLESS="1"
npm start
```

## Hasil

- `data/hasil.csv`: nama, alamat, rating, telepon, website, label pencarian, URL Maps, teks waktu ulasan terbaru, waktu pengambilan. Telepon/website kosong jika tidak tersedia.
- `data/state.json`: sumber hasil, antrean, deduplikasi ID tempat/URL, status filter, kegagalan pencarian. Disimpan melalui file sementara lalu rename. CSV dibentuk ulang dari checkpoint setelah tiap perubahan, termasuk saat melanjutkan sesi.
- `label_pencarian` adalah keyword/lokasi asal, bukan kategori bisnis terverifikasi. Edit `keywords` untuk mengubah cakupan; tambah label hasil di `extract()` dan `fields`.

Ulasan diurutkan **Terbaru**. Hanya tanggal relatif yang jelas masih dalam satu tahun kalender terakhir yang lolos. Tanggal yang pembulatannya melintasi batas (misalnya “11 bulan lalu”, “setahun lalu”) diberi `unknown`, tidak diekspor. Teks tanggal tetap dicatat jika berhasil dibaca. Tanpa tab ulasan: `unknown`. Alamat tanpa Jawa Barat/West Java tidak diekspor karena wilayah belum dapat dipastikan.

Kegagalan detail dicoba maksimal dua kali, lalu `error`. Kegagalan pencarian dicatat di `queryErrors`; pencarian berikutnya tetap berjalan. CAPTCHA menghentikan sesi, tidak dilewati otomatis. Periksa browser/log sebelum melanjutkan. Jika proses dihentikan paksa, pastikan tidak ada proses scraper aktif sebelum menghapus `data/session.lock`.

Untuk mulai ulang, pindahkan folder `data` sebagai arsip sebelum `npm start`. Jangan mengubah urutan kota/keyword pada sesi yang checkpoint-nya masih digunakan.

## Batas cakupan

Pencarian Maps tidak menjamin seluruh bisnis tampil. Enam keyword mencakup kategori yang disepakati, bukan inventaris lengkap semua F&B. Jumlah hasil dalam 4–5 jam tidak dijamin. Hasil per pencarian juga tidak memiliki batas tetap yang dapat diandalkan. Selector Maps bisa berubah; kegagalan ekstraksi tercatat, bukan dianggap lolos. Pemeriksaan otomatis menguji filter tanggal; keberhasilan scraping perlu dicek pada browser dengan koneksi langsung.
