# 🏙️ Petualangan Kota Angka

Game edukasi bergaya *endless runner* (mirip Subway Surfers) untuk melatih matematika dasar anak SD. Pemain berlari menyusuri kota, menghindari rintangan kecil dengan berpindah jalur, dan setiap beberapa saat akan bertemu **Gerbang Angka** — rintangan besar yang hanya bisa dihancurkan dengan menjawab soal matematika dengan benar.

## ✨ Fitur Utama

- **Pilih karakter:** di layar mulai, pemain bisa memilih karakter **laki-laki** atau **perempuan**, lengkap dengan pratinjau 2D sebelum mulai bermain.
- **Karakter 2D animasi lari:** karakter digambar langsung di canvas (bukan gambar statis) dengan kaki dan tangan yang benar-benar berayun saat berlari, plus efek gerakan naik-turun (bounce) agar terasa hidup.
- **HUD yang lebih menarik:** avatar mini pemain yang ikut berlari real-time, skor dengan efek "bump" saat naik, lencana level dengan bar progres menuju level berikutnya, dan lencana **Combo** yang muncul saat menjawab beberapa Gerbang Angka berturut-turut dengan benar (combo memberi bonus skor tambahan).
- **Papan Peringkat (Leaderboard):** menyimpan 10 skor tertinggi langsung di browser pemain (`localStorage`) — tidak perlu server/database. Bisa dibuka dari layar mulai, dan setelah permainan selesai pemain bisa memasukkan nama untuk menyimpan skornya.
  > ⚠️ Catatan: karena disimpan di `localStorage`, papan peringkat ini **bersifat lokal per perangkat/browser** — skor pemain A di HP-nya tidak akan muncul di komputer pemain B. Jika nanti kamu ingin peringkat yang benar-benar bersama (global, untuk satu kelas misalnya), perlu ditambahkan backend/database sederhana (lihat bagian "Ide Pengembangan Lanjutan").

## 🎮 Cara Bermain

- **Desktop:** tombol panah `⬅️ / ➡️` atau `A / D` untuk berpindah jalur. Saat soal muncul, klik jawaban atau tekan tombol angka `1-4`.
- **HP/Tablet:** ketuk tombol panah di layar, atau geser (*swipe*) kiri/kanan di layar permainan.
- Hindari rintangan kecil (batu/kerucut) dengan berpindah jalur.
- Saat bertemu **Gerbang Angka**, jaAwab soal dengan benar untuk menghancurkannya dan melanjutkan perjalanan.
- Nyawa (❤️) berkurang jika menabrak rintangan kecil atau salah menjawab soal dua kali berturut-turut.
- Menjawab benar dua kali berturut-turut atau lebih akan memicu **Combo** (bonus skor +5 tiap kenaikan combo). Combo akan reset jika salah jawab.
- Level soal makin sulit seiring skor bertambah:
  - **Level 1:** penjumlahan & pengurangan angka 1–10
  - **Level 2:** penjumlahan & pengurangan angka lebih besar + perkalian dasar
  - **Level 3:** perkalian & pembagian
  - **Level 4:** campuran semua operasi dengan angka lebih besar

## 🗂️ Struktur File

```
├── index.html   → struktur halaman & tampilan (HUD, layar mulai, soal, game over)
├── game.js      → seluruh logika permainan (rendering canvas, fisika sederhana, soal matematika)
└── README.md    → dokumen ini
```

Semua kode berjalan murni di sisi klien (HTML + CSS + JavaScript, canvas 2D), tanpa dependensi eksternal selain font dari Google Fonts. Tidak perlu build tool atau server khusus.

## 🚀 Menjalankan / Menguji di GitHub

### Opsi 1 — GitHub Pages (disarankan)
1. Push folder ini ke repository GitHub kamu.
2. Buka **Settings → Pages**.
3. Pada **Branch**, pilih `main` (atau branch yang kamu pakai) dan folder `/ (root)`, lalu **Save**.
4. Tunggu beberapa saat, GitHub akan memberi URL seperti `https://<username>.github.io/<nama-repo>/`.
5. Buka URL tersebut — game bisa langsung dimainkan di browser maupun HP.

### Opsi 2 — Coba secara lokal
Karena game ini hanya file statis, cukup buka `index.html` langsung di browser, atau jalankan server lokal sederhana dari folder ini, misalnya:

```bash
python3 -m http.server 8000
```

lalu buka `http://localhost:8000` di browser.

## 🛠️ Ide Pengembangan Lanjutan

- Tambahkan papan peringkat global (bersama semua pemain) memakai layanan seperti Firebase/Supabase, bukan hanya `localStorage`.
- Tambahkan sistem koin/bintang yang bisa dikumpulkan di jalur.
- Tambahkan level "bos" dengan beberapa soal berturut-turut.
- Tambahkan mode topik soal (misalnya: bangun datar, satuan waktu) sesuai kurikulum kelas tertentu.
- Tambahkan lebih banyak pilihan kostum/aksesori karakter dan tema kota.

Selamat berkreasi dan semoga game-nya disukai anak-anak! 🎉
