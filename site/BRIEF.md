# BRIEF: caveman-indonesia landing page

Disusun sendiri atas delegasi kreatif yang eksplisit. Pengguna menerima usulan wawancara delapan pertanyaan, lalu bilang: "iya klo gitu coba buatin pagenya ... pake skill scroll-craft". Jawaban di bawah adalah usulan yang diterima, bukan kutipan wawancara.

Fakta (dari repo): skill `irit`, tiga mode (singkat, jaksel, sunda), npm `caveman-indonesia` 0.2.0, plugin marketplace Claude Code, skills CLI. Semua angka di halaman dibuat oleh `site/tools/build-data.py` dari `benchmarks/samples.json` (tiktoken o200k_base).
Asumsi: pengunjung utama adalah developer Indonesia yang memakai coding agent; pengunjung kedua adalah developer luar yang datang dari caveman.

## Delapan topik

1. **Kesan:** batu purba ketemu terminal. Lucu, padat, teknis. Referensi: patung moai Pulau Paskah, poster cetak dua warna (merah, putih, hitam), layar tokenizer.
2. **Urutan:** masalah (agent bertele-tele), moai dan nama, pemahatan satu jawaban, fakta singkatan, tiga mode, bukti dan keamanan, pasang.
3. **Energi:** pembuka tenang, sunyi sebelum puncak, puncak paling intens, lalu main-main, lalu tenang dan padat di penutup.
4. **Rasa per tahap dan satu momen:** lihat kurva di bawah. Momennya: jawaban 160 token dipahat sampai tinggal 48.
5. **Yang belum ada di situs lain:** scroll sebagai pahat. Basa-basi retak dan jatuh per token, dan penghitungnya turun dengan angka asli.
6. **Jarak dari premium-minimal:** jauh. Poster tipografi gelap dengan aksen merah, sedikit brutal, sedikit main-main.
7. **Satu dunia atau adegan:** adegan terpisah.
8. **Aset:** logo moai berpeci (SVG), data benchmark, output installer asli. Tidak ada foto atau video, tidak ada kie.ai.

## Grammar: typographic poster

Aset utama merek ini adalah kalimat dan angka, bukan foto. Live surface kalah karena produknya gaya jawaban, bukan aplikasi yang bisa dioperasikan; meniru layar chat agent sama dengan terminal palsu. Filmic one-shot dan continuous world butuh rekaman yang tidak ada. Chaptered editorial terlalu panjang untuk produk satu baris. Gallery cocok untuk tiga mode, tapi bukan untuk seluruh halaman. Split stage tergoda (normal lawan irit), tapi perbandingannya cuma satu momen, jadi jadi puncak, bukan struktur. Rhythmic cutlist bertabrakan dengan puncak yang butuh tahan lama.

Konsekuensi poster: tidak ada bar navigasi; nama "irit" dipasang sebagai komposisi di hero; tidak ada scrub, scrim, kartu, tilt, atau parallax pada teks; penutup memakai tipe paling kecil di halaman dengan perintah sebagai tautan polos.

## Signature move: pahat basa-basi

Jawaban biasa ditampilkan per token asli (o200k_base). Saat scroll, token basa-basi memerah, retak, lalu jatuh, berurutan: pembuka, penutup, sapaan dan ragu-ragu, kata kosong. Penghitung turun dari 160 ke 102 sesuai token yang jatuh. Lalu sisanya diganti jawaban mode singkat, 48 token, juga per token asli. Kode JS milik halaman, membaca `--sc-p`; engine tidak diubah.

**Kalimat untuk teman:** "Itu situs yang jawabannya AI dipahat pas kamu scroll, basa-basinya rontok satu-satu sampai tinggal 48 token."

## Kurva rasa

| Babak | Rasa | Penyebab di layar |
|---|---|---|
| 1 Hero | Geli, kenal | Moai berpeci di depan kata "irit" raksasa; judul "Agent kamu kebanyakan ngomong." Bidang bergeser beda kecepatan |
| 2 Sunyi | Sadar, sedikit risih | Tiga kalimat pendek tentang menyapa, mendoakan, dan bayar token. Diam, tanpa gerak selain masuk |
| 3 Puncak | Puas, takjub | Pahat basa-basi. Span terpanjang di halaman |
| 4 Fakta | Kejutan | `tdk` dua token, `tidak` satu. Wipe membuka potongan tokennya |
| 5 Mode | Main-main | Tiga logat bergeser ke samping |
| 6 Bukti | Percaya | Persentase asli naik saat terlihat; contoh peringatan yang tetap lengkap |
| 7 Pasang | Yakin, tenang | Tipe paling kecil, satu perintah, satu tombol salin |

**Puncak:** babak 3. Babak 2 sengaja sunyi supaya puncak punya sesuatu untuk dikontraskan. Ini sunyi yang disengaja, bukan dead scroll.

## Skor

| Babak | Device | Alasan |
|---|---|---|
| 1 Hero | `pin` + `parallax` pada bidang SVG + `kinetic` lines + pointer lean | Kedalaman dari bidang moai, piringan merah putih, serpihan; teks tidak ikut parallax |
| 2 Sunyi | `flow` + `in` | Dokumen biasa, kontras terhadap dua pin di kiri-kanannya |
| 3 Puncak | `pin` (span 3.8) + JS halaman | Bingkai tahan, isi berubah; satu ide |
| 4 Fakta | `flow` + `reveal` | Wipe adalah perubahan keadaan: satu kata jadi dua potong |
| 5 Mode | `pan` | Ke samping berarti pilihan, bukan argumen |
| 6 Bukti | bagian biasa, hitung saat terlihat (JS halaman, format id-ID) | Angka asli; engine memformat titik desimal |
| 7 Pasang | `pin` (span 1.2), cue satu nilai | Penutup diam dan bertahan |

Lima keluarga device (pin, flow+in, reveal, pan, parallax) plus kinetic dan drift. Tidak ada device yang sama dua kali berturut-turut. Total sekitar 11,5 tinggi layar, enam babak ber-act.

## Gerbang fingerprint

Registry di `~/.scrollcraft/FINGERPRINTS.md` masih kosong, jadi tidak ada baris yang harus dilewati. Baris build ini ditambahkan setelah verifikasi.

## Verifikasi dan feel check

Harness scroll-craft (`shoot.mjs`) dijalankan di 1440×900, 390×844, 360×640, dan reduced motion: tidak ada dead scroll, semua cue lolos kontras 4.5:1 pada frame terburuk. Contact sheet dibuat dengan Pillow karena ffmpeg tidak terpasang. `tools/check.mjs` mengecek rail pan meluap (749px di desktop), tidak ada overflow horizontal, 160 dan 48 token ter-render, pahat berakhir di 48, tombol salin benar-benar mengisi clipboard, fokus pertama di skip link, tanpa error console.

Perbaikan dari putaran pertama: serpihan batu sempat lewat di bawah subjudul (kontras 2,12:1), dipindah keluar dari zona teks; piringan merah di ponsel naik ke bawah tombol salin (2,95:1), diturunkan; angka penghitung menabrak teks jawaban, satuan "token" dipindah ke bawah angka; rail pan desktop cuma meluap 599px, kolom mode dilebarkan; versi reduced motion menyembunyikan dua mode di luar layar, sekarang ditata jadi grid di layar lebar.

Wordmark hero: ukuran asli (39vw, 46vw di ponsel) dipertahankan. `page.js` mengukur tinta hurufnya, bukan kotak font, lalu mengangkatnya sampai garis dasarnya bebas dari judul, dan baru mengecil kalau hurufnya sendiri tidak muat. `tools/hero-overlap.mjs` mengecek 13 ukuran layar dari 360×640 sampai 2560×1080: huruf (termasuk titik i) utuh di layar dan berjarak paling sedikit 16px dari judul.

Mode terang dan gelap: tema awal dari `?theme=`, pilihan tersimpan, lalu setelan sistem. Mode terang memakai palet kertas dengan kontras teks terendah 6,54:1 di shoot.mjs (desktop, ponsel, reduced motion); drift latar tetap jalan karena `page.js` mencerminkan warna drift engine ke kertas. `check.mjs` mengecek ganti tema, label tombol, simpan setelah reload, dan sistem terang.

Feel check (scroll dingin, satu kata per babak): kenal, risih, puas, kaget, main-main, percaya, tenang. Sama dengan kurva rencana. Puncak memang perubahan visual terbesar dan span terpanjang.

Belum diverifikasi: ponsel sungguhan (Safari iOS), dan pembaca layar selain urutan fokus.
