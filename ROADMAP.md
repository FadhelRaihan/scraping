# ProjectAdmin — roadmap scraping

Baseline: satu admin, PostgreSQL lokal, serial, shadcn multi-page, checkpoint atomik, job persisten, advisory lock. Tanpa WA Blast.

## Sprint 1 — Stabilitas (implementasi)
- Batch sync 25 hasil / 30 detik; finalisasi terbatas, ledger persisten.
- Retry terklasifikasi, Retry-After, error permanen tidak memblokir hasil lainnya.
- Status hasil lengkap, progress per job, diagnostik terbatas.
- Stop/recovery dan pengujian kegagalan.

## Sprint 2 — Kualitas data (implementasi metadata; verifikasi Maps langsung tersisa)
- Tanggal absolut bila tersedia; jangan mengarang tanggal dari teks ambigu.
- Jumlah ulasan, Place ID canonical, normalisasi telepon/URL.
- Multi-category discovery, status operasional.

## Sprint 3 — Histori dan coverage (histori/API/UI diimplementasikan)
- Histori job/query/place, query per kecamatan.
- Coverage report tanpa klaim seluruh bisnis tercakup.
- Perbandingan hasil antar sesi.
- Query per kecamatan belum diaktifkan; sesuai pembatasan rencana Sprint 3 terakhir, perlu dataset wilayah terverifikasi pada sprint coverage berikutnya.

## Sprint 4 — Konfigurasi UI (diimplementasikan; sesi Maps aktif perlu verifikasi langsung)
- Durasi, wilayah, kategori, mode checkpoint, preview konfigurasi.

Urutan ini menjadi baseline pengembangan berikutnya.
