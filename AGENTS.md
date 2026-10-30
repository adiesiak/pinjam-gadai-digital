<!-- ui-ux-pro-max:start -->
## UI/UX Pro Max
Untuk pekerjaan UI, visual, mobile, aksesibilitas, tipografi, warna, grafik, atau review desain, baca `.claude/skills/ui-ux-pro-max/SKILL.md` sebelum mulai. Untuk komponen shadcn/Tailwind baca `.claude/skills/ui-styling/SKILL.md`. Untuk token, spesifikasi komponen, dan arsitektur tema baca `.claude/skills/design-system/SKILL.md`.

Data lokalnya bisa dicari lewat:
```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --design-system -p PINDAI
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --domain ux
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "<query>" --stack html-tailwind
```
Domain yang tersedia antara lain `ux`, `style`, `typography`, `color`, `chart`, `landing`, `icons`, dan `gsap`.

Aturan proyek:
- `DESIGN.md` tetap sumber arah visual PINDAI dan menang atas rekomendasi generik skill. Jangan mengganti palet, tipografi, atau keputusan satu wajah terang hanya karena hasil pencarian menyarankan sebaliknya.
- Pakai skill untuk checklist pra-rilis: kontras teks 4.5:1, target sentuh minimal 44px, fokus keyboard terlihat, `prefers-reduced-motion`, teks tidak terpotong di 375px, dan tanpa emoji sebagai ikon.
- Skill ini panduan, bukan perintah. Jangan menambah dependensi, mengubah gaya, atau merombak komponen di luar lingkup tugas.
- Untuk pekerjaan copy dan komentar kode, tetap ikuti bahasa dan nada yang sudah ada di `DESIGN.md`; skill ini tidak menggantikan aturan penulisan proyek.
<!-- ui-ux-pro-max:end -->
