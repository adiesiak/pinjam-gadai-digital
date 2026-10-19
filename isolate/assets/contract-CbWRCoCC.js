import{ar as g,b8 as T,b as n}from"./index-Dj2bsRki.js";import{n as o}from"./nama-Cl7ssZ6n.js";const k="v1.4";function s(a){return a.replace(/[&<>"']/g,i=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[i]??i)}function u(a){return a==="pendanaan"?"SURAT KESEPAKATAN ALOKASI PENDANAAN":a==="pinjaman"?"SURAT PERJANJIAN PINJAMAN":"SURAT PERJANJIAN GADAI"}function v(a,i){const r=new Date,e=`${r.getFullYear()}${String(r.getMonth()+1).padStart(2,"0")}${String(r.getDate()).padStart(2,"0")}`;return`${a==="pinjaman"?"PGC":a==="gadai"?"PGA":"PGD"}/${i}/${e}`}function c(a){return new Date(a).toLocaleDateString("id-ID",{day:"numeric",month:"long",year:"numeric"})}function w(a){return a?`${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}`:"tidak tersedia"}function m(a,i,r){const e=r.tandaTanganPeminjam;return`<div>
    <div class="ttd-slot">${e?`<img class="signature" src="${s(e.dataUrl)}" alt="Gambar tanda tangan yang dicatat aplikasi"/>`:'<div class="signature-placeholder">Belum ada gambar tanda tangan yang dicatat</div>'}</div>
    <p class="garis">${s(a)}</p>
    <p>${s(i)}</p>
  </div>`}const B=`<svg class="kop-logo" viewBox="0 0 32 32" role="img" aria-label="Logo PINDAI" xmlns="http://www.w3.org/2000/svg">
  <path d="M16 2.6 4.6 6.9v8c0 7 4.7 12.6 11.4 14.5 6.7-1.9 11.4-7.5 11.4-14.5v-8L16 2.6Z" fill="none" stroke="currentColor" stroke-width="2"/>
  <rect x="11.4" y="14.2" width="9.2" height="8" rx="1.6" fill="none" stroke="currentColor" stroke-width="2"/>
  <path d="M13.4 14.2v-2.3a2.6 2.6 0 0 1 5.2 0v2.3" fill="none" stroke="currentColor" stroke-width="2"/>
</svg>`,j=`<svg class="stamp-bulat" viewBox="0 0 120 120" role="img" aria-label="Stempel verifikasi ledger PINDAI" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
  <defs><path id="pindai-stamp-ring" d="M60,60 m-45,0 a45,45 0 1,1 90,0 a45,45 0 1,1 -90,0"/></defs>
  <circle cx="60" cy="60" r="57" fill="none" stroke="currentColor" stroke-width="2"/>
  <circle cx="60" cy="60" r="40" fill="none" stroke="currentColor" stroke-width="1"/>
  <text><textPath href="#pindai-stamp-ring" xlink:href="#pindai-stamp-ring" startOffset="50%" text-anchor="middle">VERIFIED LEDGER · PINDAI DIGITAL STAMP</textPath></text>
  <text class="kecil" x="60" y="57" text-anchor="middle">PINDAI</text>
  <text class="kecil" x="60" y="69" text-anchor="middle">E-SIGN</text>
</svg>`;function P(){return`<div>
    <div class="ttd-slot">${j}</div>
    <p class="garis">Pinjam Gadai Digital</p>
    <p>PINDAI — Pihak Pertama</p>
  </div>`}function h(a,i){return`<header class="kop">
    <div class="kop-kiri">
      ${B}
      <div>
        <p class="kop-judul">PINJAM GADAI DIGITAL (PINDAI)</p>
        <p class="kop-sub">Platform Layanan Keuangan &amp; Ledger Digital</p>
      </div>
    </div>
    <div class="kop-kanan">
      <span class="kop-badge">Syarat ${k}</span>
      <span class="kop-ref">Ref: ${s(v(a,i.nomorReferensi))}</span>
    </div>
  </header>`}function $(){return`<footer class="footer-dok">
    <span>Dokumen ini sah dan diterbitkan secara elektronik melalui sistem pencatatan internal PT Pinjam Gadai Digital (PINDAI).</span>
    <span>Legalitas &amp; Verifikasi: support@pindai.biz.id | pindai.biz.id</span>
  </footer>`}function N(a){return`<table class="rincian">
    <thead>
      <tr><th>Komponen</th><th style="text-align:right">Nominal</th></tr>
    </thead>
    <tbody>
      <tr><td>Pokok pinjaman</td><td class="angka">${n(a.pokok)}</td></tr>
      <tr><td>Potongan admin (2%)</td><td class="angka">${n(a.biayaAdmin)}</td></tr>
      <tr><td>Biaya platform</td><td class="angka">${n(a.biayaPlatform)}</td></tr>
      <tr><td>Dana bersih diterima (98% dari pokok)</td><td class="angka">${n(a.danaBersihDitransfer)}</td></tr>
      <tr><td>Bunga</td><td class="angka">${n(a.bunga)}</td></tr>
      <tr class="total"><td>Total kewajiban (130% dari pokok)</td><td class="angka">${n(a.totalKewajibanPelunasan)}</td></tr>
    </tbody>
  </table>`}function x(a){return`<table class="rincian">
    <thead>
      <tr><th>Komponen</th><th style="text-align:right">Nominal</th></tr>
    </thead>
    <tbody>
      <tr><td>Pokok acuan</td><td class="angka">${n(a.pokokDibiayai)}</td></tr>
      <tr><td>Uang muka (0%)</td><td class="angka">${n(a.dp)}</td></tr>
      <tr><td>Potongan di muka (2%)</td><td class="angka">${n(a.potonganDiMuka)}</td></tr>
      <tr><td>Dana bersih diterima</td><td class="angka">${n(a.danaDiterima)}</td></tr>
      <tr><td>Bunga/margin total (${a.persenBungaPerBulan}%/bulan, flat)</td><td class="angka">${n(a.bungaTotal)}</td></tr>
      <tr class="total"><td>Total pengembalian (${a.tenorBulan} bulan)</td><td class="angka">${n(a.totalPengembalian)}</td></tr>
    </tbody>
  </table>`}function b(){return"<p><strong>Para Pihak:</strong> Perjanjian ini dibuat dan disetujui oleh <strong>Pinjam Gadai Digital (PINDAI)</strong> sebagai Pihak Pertama dan pihak yang datanya tercantum di bawah sebagai Pihak Kedua. Nilai, jadwal, dan setiap perubahan status mengikuti pencatatan pada ledger internal aplikasi. Pencairan dana, pembayaran ke merchant, serta inspeksi, penyerahan, dan penitipan barang ditangani di luar aplikasi.</p>"}function K(a,i,r,e,t=null,l=g.percentPerDay){const d=`Denda keterlambatan ${l}% per hari dari pokok, maksimum ${g.maxPercent}%.`,y=c(r.timestampPada),D=t===null?`<li>Periode acuan: <strong>${e} hari</strong> sejak tanggal status alokasi dicatat di aplikasi.</li>`:`<li>Periode acuan: <strong>${t.tenorBulan} bulan</strong> (1 bulan = 30 hari) sejak tanggal status alokasi dicatat di aplikasi.</li>`,f=t!==null&&(t.tenorBulan===3||t.tenorBulan===6)?`<li>Biaya admin 2%: ${n(t.biayaAdminTotal)}.</li>
      <li>Total potongan di muka 2% (${n(t.biayaLayananTotal)}) dipotong di muka dari dana yang diterima — biaya platform dihapus (0%).</li>
      <li>Biaya admin layanan cicilan 2% dari nominal cicilan: ${n(t.biayaAdminCicilanTotal)} selama ${t.tenorBulan} bulan (bulan pertama ${n(t.biayaAdminCicilanPerBulan)}), dibayar bersama setiap cicilan.</li>`:t!==null?`<li>Biaya layanan 2% dari pokok acuan: ${n(t.biayaLayananTotal)}, dipotong di muka dari dana yang diterima.</li>`:"",A=t===null?`
      <li>Biaya admin 2%: ${n(i.biayaAdmin)}.</li>
      <li>Total potongan di muka 2%: ${n(i.totalPotonganDiMuka)} (biaya platform dihapus — 0%).</li>
      <li><strong>Perhitungan dana bersih: ${n(i.danaBersihDitransfer)} (98% dari pokok)</strong>; dana diteruskan sesuai proses pencairan.</li>
      <li>Bunga: ${n(i.bunga)}.</li>
      <li><strong>Total kewajiban: ${n(i.totalKewajibanPelunasan)} (130% dari pokok)</strong>; nominal mengikuti perhitungan aplikasi.</li>`:`
      <li>Uang muka: ${n(t.dp)} — 0% dari pokok acuan.</li>
      ${f}
      <li><strong>Dana bersih yang diterima: ${n(t.danaDiterima)} (pokok ${n(t.pokokDibiayai)} setelah potongan di muka ${n(t.potonganDiMuka)})</strong>; dana diteruskan sesuai proses pencairan.</li>
      <li>Bunga/margin sebesar ${t.persenBungaPerBulan}% per bulan dari POKOK ACUAN (flat, tidak menurun dari sisa pokok); total ${n(t.bungaTotal)}.</li>
      <li><strong>Ilustrasi cicilan rata: bulan pertama ${n(t.cicilanPerBulan)}, bulan terakhir ${n(t.cicilanTerakhir)}; total ${n(t.totalPengembalian)} untuk ${t.tenorBulan} bulan (sudah termasuk pokok, bunga, dan biaya admin cicilan).</strong> Rincian per bulan: ${t.jadwal.map(p=>`bulan ${p.bulan} ${n(p.total)}`).join("; ")}. Jadwal bersifat ilustrasi; perubahan status lunas di aplikasi dicatat sebagai entri ledger.</li>`,I=t===null?`Kewajiban dilunasi dalam ${e} hari sejak tanggal pencairan. Pelunasan ditangani di luar aplikasi dan statusnya dicatat tim PINDAI pada ledger internal. ${d}`:`Cicilan bulanan dibayar sesuai jadwal pada Pasal 2. Setiap perubahan status dicatat pada ledger internal aplikasi. ${d}`;return`
  <div class="contract">
    ${h("pinjaman",r)}
    <h1>${u("pinjaman")}</h1>
    ${b()}

    <p>Perjanjian ini dibuat dan disetujui pada <strong>${y}</strong> atas data pengajuan yang tersimpan di aplikasi PINDAI.</p>
    <p><strong>Pihak Pertama:</strong> Pinjam Gadai Digital (PINDAI).</p>
    <p><strong>Pihak Kedua:</strong> ${s(o(a.namaLengkap))}${a.nik?`, NIK ${s(a.nik)}`:""}; informasi bank/e-wallet dan rekening/akun yang dimasukkan: <strong>${a.namaBank?`${s(a.namaBank)} · `:""}${s(a.nomorRekening)}</strong>. Data ini berasal dari pengisian pada pengajuan.</p>

    <h2>Pasal 1 — Pokok, Tenor, dan Status</h2>
    <ol>
      <li>Pokok pinjaman: <strong>${n(i.pokok)}</strong>.</li>
      ${D}
      <li>Status pinjaman mengikuti pencatatan pada ledger internal aplikasi.</li>
    </ol>

    <h2>Pasal 2 — Biaya, Bunga, dan Total Kewajiban</h2>
    <ol>${A}
    </ol>
    <p><strong>Ringkasan rincian keuangan:</strong></p>
    ${t===null?N(i):x(t)}

    <h2>Pasal 3 — Cara dan Waktu Pelunasan</h2>
    <p>${I}</p>

    <h2>Pasal 4 — Persetujuan dan Tanda Tangan</h2>
    <p>Persetujuan dinyatakan dengan menandai checkbox dan membubuhkan tanda tangan pada kanvas, dan dicatat aplikasi pada syarat versi <strong>${k}</strong>.</p>

    <h2>Pasal 5 — Data, Lokasi, dan Waktu</h2>
    <p>Timestamp sistem <strong>${new Date(r.timestampPada).toLocaleString("id-ID")}</strong>${r.lokasi?` dan koordinat perangkat yang dikirim <strong>${w(r.lokasi)}</strong>`:""} ditampilkan sebagai metadata masukan pengajuan.</p>

    <div class="ttd">
      ${m(o(a.namaLengkap),"Peminjam — Pihak Kedua",r)}
      ${P()}
    </div>
    ${$()}
  </div>`}function G(a,i,r){const e=c(r.timestampPada),t=i.hargaPasar>0?Math.round(i.nilaiTaksiran/i.hargaPasar*100):0,l=i.pokokGadai!==void 0&&i.persenSewaModal!==void 0?T(i.pokokGadai,i.persenSewaModal):null,d=l===null?"<li>Pokok gadai dan sewa modal belum ditetapkan; belum ada hitungan yang dapat ditampilkan.</li>":`<li>Pokok gadai: <strong>${n(l.pokok)}</strong>.</li>
      <li>Potongan 1%: ${n(l.potonganDiMuka)}; nilai bersih (99%): <strong>${n(l.danaBersihDitransfer)}</strong>; dana diteruskan sesuai proses pencairan.</li>
      <li>Perhitungan sewa modal ${i.persenSewaModal}% per 30 hari dari sisa pokok; ilustrasi periode pertama ${n(l.sewaModalPeriode)}; nominal mengikuti perhitungan aplikasi.</li>`;return`
  <div class="contract">
    ${h("gadai",r)}
    <h1>${u("gadai")}</h1>
    ${b()}
    <p>Akad ini dibuat dan disetujui pada <strong>${e}</strong> atas data pengajuan yang tersimpan di aplikasi PINDAI.</p>
    <p><strong>Pihak Pertama:</strong> Pinjam Gadai Digital (PINDAI).</p>
    <p><strong>Pihak Kedua:</strong> ${s(o(a.namaLengkap))}${a.nik?`, NIK ${s(a.nik)}`:""}; informasi rekening yang dimasukkan: <strong>${a.namaBank?`${s(a.namaBank)} · `:""}${s(a.nomorRekening)}</strong>. Data ini berasal dari pengisian pada pengajuan.</p>

    <h2>Pasal 1 — Data Barang dan Lokasi Penyimpanan</h2>
    <ol>
      <li>Deskripsi barang: <strong>${s(i.deskripsiBarang)}</strong>.</li>
      <li>Kategori barang: ${s(i.kategori)}.</li>
      <li>Catatan kondisi fisik: ${s(i.kondisiFisik||"belum dicatat")}.</li>
      <li>Kode/referensi lokasi penyimpanan: <strong>${s(i.kodeRakVault)}</strong>; dipakai sebagai acuan penyimpanan barang pada akad ini.</li>
    </ol>

    <h2>Pasal 2 — Nilai Taksiran dan Pokok Gadai</h2>
    <ol>
      <li>Harga pasar yang dicantumkan: ${n(i.hargaPasar)}.</li>
      <li>Nilai taksiran: <strong>${n(i.nilaiTaksiran)}</strong> (LTV ${t}%, batas aplikasi ${i.ltvPersen}%); nilai taksiran ditetapkan tim PINDAI.</li>
      ${d}
    </ol>

    <h2>Pasal 3 — Penyimpanan dan Penyelesaian</h2>
    <ol>
      <li>Barang disimpan sesuai kode lokasi pada Pasal 1, dan serah terima barang dinyatakan dengan tanda terima terpisah.</li>
      <li>Pengembalian barang dilakukan setelah kewajiban dilunasi dan dikonfirmasi langsung dengan petugas PINDAI. Status siap diambil pada aplikasi menandai selesainya pencatatan pada ledger.</li>
      <li>Penyelesaian atau lelang jaminan dilaksanakan sesuai ketentuan yang berlaku; angka pada aplikasi menjadi acuan perhitungan.</li>
    </ol>

    <h2>Pasal 4 — Persetujuan dan Tanda Tangan</h2>
    <p>Persetujuan dinyatakan dengan menandai checkbox dan membubuhkan tanda tangan pada kanvas, dan dicatat aplikasi pada syarat versi <strong>${k}</strong>.</p>

    <h2>Pasal 5 — Data, Lokasi, dan Waktu</h2>
    <p>Timestamp sistem <strong>${new Date(r.timestampPada).toLocaleString("id-ID")}</strong> dan koordinat yang tampil pada aplikasi adalah metadata yang dicatat pada pengajuan.</p>

    <div class="ttd">
      ${m(o(a.namaLengkap),"Peminjam — Pihak Kedua",r)}
      ${P()}
    </div>
    ${$()}
  </div>`}export{k as C,G as a,K as b,v as n};
