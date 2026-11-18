# LendLoop | Laporan perbaikan Fase 4 Natty | 18 Nov 2026

Perbaikan CACAT-001 sampai CACAT-007 dan FRICTION-001 sudah diterapkan. Build dan pemeriksaan dengan data tiruan lulus. Rilis produksi tertahan pada push ke `origin/v2`.

## Temuan dan perubahan

Rujukan akar masalah memakai nomor baris pada `06fb678`. Rujukan perbaikan memakai nomor baris pada commit perbaikan.

| Item | Akar di kode | Perbaikan |
| --- | --- | --- |
| CACAT-001 | `app/dashboard/page.tsx:145-168` mengaktifkan query privat setelah `ensureMe` melalui flag `ready` yang tetap aktif saat sesi berakhir. `convex/lib/auth.ts:17` menolak akses saat token sudah hilang. Ini sesuai dengan gejala sign-out intermiten di laporan Natty. | `app/dashboard/page.tsx:163-180` melepas pohon komponen beserta query privat saat sesi Clerk hilang atau auth Convex belum siap. Dashboard yang kehilangan sesi kembali ke `/`. `app/layout.tsx:24` menetapkan `/` sebagai tujuan sign-out Clerk. |
| CACAT-002 | Efek `ensureMe` berjalan saat Dashboard terpasang (`app/dashboard/page.tsx:148-153`) sebelum frontend menerima konfirmasi token Convex. `convex/lib/auth.ts:17` menolak mutasi tanpa identitas. | `app/dashboard/page.tsx:142-180,209-230` menampilkan skeleton saat auth dimuat, mengarahkan pengunjung tanpa sesi ke `/sign-in`, dan baru menjalankan provisioning setelah Convex mengonfirmasi auth. Query user baru aktif setelah provisioning selesai. Sesi Clerk yang gagal terhubung ke Convex mendapat pesan Inggris dan tombol coba lagi. Pemeriksaan identitas server tetap berlaku. |
| CACAT-003 | Dua input tanggal native berbagi kartu dengan kolom minimum 240 px (`app/dashboard/page.tsx:302-329`, `app/globals.css:495-499,542-546`). Lebar efektif tiap kolom bisa di bawah lebar kontrol tanggal. Pesan tanggal terbalik juga berada dalam satu kolom. | Kartu yang sedang menerima request memakai satu baris grid penuh. Dua input `type="date"` tetap berdampingan pada breakpoint mobile dan desktop, dengan padding horizontal yang lebih kecil. Kalender dan masukan keyboard mengikuti kontrol native browser. Pesan tanggal terbalik memakai lebar form dan terhubung ke input End lewat `aria-describedby` (`app/globals.css:514-516,562-571`, `app/dashboard/page.tsx:310,348-373`). |
| CACAT-004 | Guard `hasApprovedOverlap` hanya membaca status `approved` (`convex/requests.ts:31-62`). | `convex/requests.ts:59-68` menolak request `pending` yang overlap untuk peminjam dan barang yang sama, termasuk tanggal identik dan batas yang bersinggungan. Create dan approve memakai pembacaan indeks barang yang sama. Syarat approve tetap memeriksa overlap dengan pinjaman yang sudah disetujui (`convex/requests.ts:155-165`). |
| CACAT-005 | `messageFrom` mengirim `error.message` langsung ke banner (`app/dashboard/page.tsx:115-117,150-153,170-183`), termasuk metadata dan stack Convex. | `app/dashboard/page.tsx:119-140,211-214,232-245` memetakan hanya nilai `ConvexError.data` yang dikenal ke pesan Inggris yang membantu. Error lain mendapat pesan umum dan opsi coba lagi pada setup. Pesan pengguna bebas dari prefiks Convex, Request ID, dan path internal. |
| CACAT-006 | Catatan sign-in pada `app/page.tsx:70-72` selalu dirender. | Catatan hanya muncul di `Show when="signed-out"` (`app/page.tsx:70-74`). |
| CACAT-007 | Form hanya memakai `required` (`app/dashboard/page.tsx:386-392`). Create dan update server hanya menguji teks kosong (`convex/items.ts:66,96`). | Form memakai `maxLength={80}` dan server menguji nama pada create maupun update, dengan batas yang sama (`app/dashboard/page.tsx:430-436`, `convex/lib/shared.ts:13`, `convex/items.ts:8-12,72,102`). Nilai yang melebihi batas mendapat pesan ramah. |
| FRICTION-001 | Kartu katalog publik berupa `article` tanpa aksi (`app/page.tsx:63-66`). | Kartu menjadi tautan ke `/dashboard` yang membuka Browse secara default (`app/page.tsx:63-66`, `app/dashboard/page.tsx:195`). |

## Bukti build dan pemeriksaan

`npm run build` berhasil dengan kode keluar 0 dari root repo.

```text
▲ Next.js 15.5.29
✓ Compiled successfully in 1935ms
  Linting and checking validity of types ...
  Collecting page data ...
✓ Generating static pages (5/5)
  Finalizing page optimization ...
  Collecting build traces ...
○ /            1.49 kB    208 kB First Load JS
○ /dashboard   8.44 kB    179 kB First Load JS
ƒ Middleware   97.8 kB
```

`node scripts/check-dashboard.mjs` lulus. Harness mencakup penundaan `ensureMe`, pelepasan konten saat sign-out, pengalihan tanpa sesi, validasi tanggal, penyembunyian detail error, overlap request pending, serta batas panjang nama server dan klien. React mencetak peringatan atribut `jsx` dan `global` saat merender styled-jsx di harness. Build produksi lulus tanpa peringatan tersebut. `git diff --check` juga lulus.

Pemeriksaan login dan sign-out nyata, pemilihan tanggal di popup native, serta regresi produksi masih tertunda. `npm run start -- --hostname 127.0.0.1 --port 3030` ditolak dengan `Error: listen EPERM: operation not permitted 127.0.0.1:3030`. Playwright CLI ditolak saat membuat direktori cache dan Chrome headless berhenti dengan `SIGABRT`. Browser MCP memerlukan persetujuan yang tidak tersedia di sesi ini. Layout tanggal dan pesan inline diperiksa di markup harness.

## Commit, push, dan deploy

- Commit kode pada branch `v2` di `/private/tmp/lendloop-release.jM24li`: `2a9baaa694d65278a7372fc8ccaa0467e1b8c51c` (`Migrate to Clerk 7 and fix LendLoop onboarding defects`). Commit mencakup seluruh perubahan awal, termasuk migrasi Clerk 7, hasil generate Convex, konfigurasi auth Convex, dan perubahan Compose.
- Repo asli berawal di `06fb678` dan perubahan tetap tersedia di working tree. `git add -A` di repo asli gagal dengan `fatal: Unable to create '/Users/danyarkham/saas/lendloop/.git/index.lock': Operation not permitted`. Commit kode dan laporan disimpan di salinan Git yang bisa ditulis.
- `git push origin v2` dari salinan tersebut gagal dengan kode keluar 128. Pemeriksaan HTTPS ke GitHub juga gagal dengan `Could not resolve host: github.com`.

```text
ssh: Could not resolve hostname github.com: -65563
fatal: Could not read from remote repository.

Please make sure you have the correct access rights
and the repository exists.
```

- `npx vercel --prod` menunggu push yang berhasil sesuai urutan brief. URL deployment baru belum tersedia. Publikasi fungsi Convex produksi dan regresi Natty juga masih tertunda.

Semua item dalam brief diterapkan di kode. Skema, aturan otorisasi mutasi, dan konfigurasi lewat dashboard web tetap sama.
