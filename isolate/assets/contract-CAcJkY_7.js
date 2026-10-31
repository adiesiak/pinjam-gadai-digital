import{q as w}from"./gadai-DHG_Nj39.js";import{L as m,f as i}from"./index-BRrSma9I.js";import{n as k}from"./nama-CbPOpGnk.js";const o="v1.4";function s(a){return a.replace(/[&<>"']/g,n=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[n]??n)}function $(a){return a==="pendanaan"?"SURAT KESEPAKATAN ALOKASI PENDANAAN":a==="pinjaman"?"SURAT PERJANJIAN PINJAMAN":"SURAT PERJANJIAN GADAI"}function p(a,n){const d=new Date,r=`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,"0")}${String(d.getDate()).padStart(2,"0")}`;return`${a==="pinjaman"?"PGC":a==="gadai"?"PGA":"PGD"}/${n}/${r}`}function h(a){return new Date(a).toLocaleDateString("id-ID",{day:"numeric",month:"long",year:"numeric"})}function N(a){return a?`${a.lat.toFixed(5)}, ${a.lng.toFixed(5)}`:"tidak tersedia"}function P(a){return new Date(a).toLocaleString("id-ID",{day:"2-digit",month:"short",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:!1})}function g(a){const n=a.persetujuanSyarat;return n?.pada==null?"":`Disetujui digital pada ${P(n.pada)} WIB untuk syarat versi ${n.versi??o}.`}function y(a,n,d){const r=d.tandaTanganPeminjam,t=r?`<img class="signature" src="${s(r.dataUrl)}" alt="Gambar tanda tangan yang dicatat aplikasi"/>`:'<div class="signature-placeholder">Belum ada gambar tanda tangan yang dicatat</div>',e=g(d),l=r?`${e?`${e} `:""}Tanda tangan elektronik tercatat pada ${P(r.tandaTanganPada??Date.now())} WIB.`:e?`${e} Kolom di atas disediakan untuk tanda tangan manual.`:"Persetujuan syarat belum tercatat.";return`<div>
    <div class="ttd-slot">${t}</div>
    <p class="garis">${s(a)}</p>
    <p>${s(n)}</p>
    <p class="ttd-catatan">${s(l)}</p>
  </div>`}const S=`<svg class="kop-logo" viewBox="0 0 32 32" role="img" aria-label="Logo PINDAI" xmlns="http://www.w3.org/2000/svg">
  <path d="M16 2.6 4.6 6.9v8c0 7 4.7 12.6 11.4 14.5 6.7-1.9 11.4-7.5 11.4-14.5v-8L16 2.6Z" fill="none" stroke="currentColor" stroke-width="2"/>
  <rect x="11.4" y="14.2" width="9.2" height="8" rx="1.6" fill="none" stroke="currentColor" stroke-width="2"/>
  <path d="M13.4 14.2v-2.3a2.6 2.6 0 0 1 5.2 0v2.3" fill="none" stroke="currentColor" stroke-width="2"/>
</svg>`,K=`<svg class="stamp-bulat" viewBox="0 0 120 120" role="img" aria-label="Stempel PINDAI" xmlns="http://www.w3.org/2000/svg">
  <circle cx="60" cy="60" r="56" fill="none" stroke="currentColor" stroke-width="8"/>
  <circle cx="60" cy="60" r="45" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <text x="60" y="61" text-anchor="middle" dominant-baseline="middle">PINDAI</text>
</svg>`;function b(){return`<div>
    <div class="ttd-slot">${K}</div>
    <p class="garis">Pinjam Gadai Digital</p>
    <p>PINDAI — Pihak Pertama</p>
  </div>`}function f(a,n){return`<header class="kop">
    <div class="kop-kiri">
      ${S}
      <div>
        <p class="kop-judul">PINDAI</p>
        <p class="kop-sub">Dokumen Perjanjian Digital</p>
      </div>
    </div>
    <div class="kop-kanan">
      <span class="kop-badge">Syarat ${o}</span>
      <span class="kop-ref">Ref: ${s(p(a,n.nomorReferensi))}</span>
    </div>
  </header>`}function v(a){const n=a.verifikasi;if(!n)return"";const d=new Date(n.diterbitkanPada).toLocaleString("id-ID",{day:"2-digit",month:"long",year:"numeric",hour:"2-digit",minute:"2-digit",hour12:!1});return`<section class="verif">
    ${n.qrDataUrl?`<img class="verif-qr" src="${s(n.qrDataUrl)}" alt="QR halaman verifikasi dokumen"/>`:`<div class="verif-qr verif-qr-kosong" data-qr-url="${s(n.url)}">QR</div>`}
    <div class="verif-teks">
      <p class="verif-judul">Verifikasi keaslian dokumen</p>
      <p>Kode <span class="verif-kode">${s(n.kode)}</span> · diterbitkan ${s(d)} (WIB)</p>
      <p class="verif-hash">SHA-256 ${s(n.hash)}</p>
      <p>Pindai QR atau buka ${s(n.url)}. Cocokkan hash di halaman itu dengan hash pada dokumen ini.</p>
    </div>
  </section>`}function D(){return`<footer class="footer-dok">
    <span>Dokumen ini sah dan diterbitkan secara elektronik melalui sistem pencatatan internal PT Pinjam Gadai Digital (PINDAI).</span>
    <span>Legalitas &amp; Verifikasi: support@pindai.biz.id | pindai.biz.id</span>
  </footer>`}function L(a){return`<table class="rincian">
    <thead>
      <tr><th>Komponen</th><th style="text-align:right">Nominal</th></tr>
    </thead>
    <tbody>
      <tr><td>Pokok pinjaman</td><td class="angka">${i(a.pokok)}</td></tr>
      <tr><td>Potongan admin (2%)</td><td class="angka potongan">${i(a.biayaAdmin)}</td></tr>
      <tr><td>Biaya platform</td><td class="angka ${a.biayaPlatform>0?"potongan":""}">${i(a.biayaPlatform)}</td></tr>
      ${a.biayaExpress>0?`<tr><td>Biaya pencairan ekspres</td><td class="angka potongan">${i(a.biayaExpress)}</td></tr>`:'<tr><td>Pencairan ekspres</td><td class="angka">Tidak dipilih</td></tr>'}
      <tr><td>Total potongan di muka</td><td class="angka">${i(a.totalPotonganDiMuka)}</td></tr>
      <tr class="bersih"><td>Dana bersih diterima</td><td class="angka">${i(a.danaBersihDitransfer)}</td></tr>
      <tr><td>Bunga</td><td class="angka">${i(a.bunga)}</td></tr>
      <tr class="total"><td>Total kewajiban (pokok + bunga)</td><td class="angka">${i(a.totalKewajibanPelunasan)}</td></tr>
    </tbody>
  </table>`}function x(a){return`<table class="rincian">
    <thead>
      <tr><th>Komponen</th><th style="text-align:right">Nominal</th></tr>
    </thead>
    <tbody>
      <tr><td>Pokok acuan</td><td class="angka">${i(a.pokokDibiayai)}</td></tr>
      <tr><td>Uang muka (0%)</td><td class="angka">${i(a.dp)}</td></tr>
      <tr><td>Potongan di muka (${a.tarif.persenBiayaLayananBulanan}%)</td><td class="angka potongan">${i(a.potonganDiMuka)}</td></tr>
      <tr class="bersih"><td>Dana bersih diterima</td><td class="angka">${i(a.danaDiterima)}</td></tr>
      <tr><td>Bunga/margin total (${a.persenBungaPerBulan}%/bulan, flat)</td><td class="angka">${i(a.bungaTotal)}</td></tr>
      ${a.biayaAdminCicilanTotal>0?`<tr><td>Biaya admin cicilan ${a.tarif.persenBiayaAdminCicilanBulanan}% (${a.tenorBulan} kali bayar)</td><td class="angka">${i(a.biayaAdminCicilanTotal)}</td></tr>`:""}
      <tr class="total"><td>Total pengembalian (${a.tenorBulan} bulan)</td><td class="angka">${i(a.totalPengembalian)}</td></tr>
    </tbody>
  </table>`}function B(){return"<p><strong>Para Pihak:</strong> Perjanjian ini dibuat dan disetujui oleh <strong>Pinjam Gadai Digital (PINDAI)</strong> sebagai Pihak Pertama dan pihak yang datanya tercantum di bawah sebagai Pihak Kedua. Nilai, jadwal, dan setiap perubahan status mengikuti pencatatan pada ledger internal aplikasi. Pencairan dana, pembayaran ke merchant, serta inspeksi, penyerahan, dan penitipan barang ditangani di luar aplikasi.</p>"}function E(a,n,d,r,t=null,e=m.percentPerDay){const l=`Denda keterlambatan ${e}% per hari dari pokok, maksimum ${m.maxPercent}%.`,u=h(d.timestampPada),T=t===null?`<li>Periode acuan: <strong>${r} hari</strong> sejak tanggal status alokasi dicatat di aplikasi.</li>`:`<li>Periode acuan: <strong>${t.tenorBulan} bulan</strong> (1 bulan = 30 hari) sejak tanggal status alokasi dicatat di aplikasi.</li>`,A=t===null?"":(t.tenorBulan===3||t.tenorBulan===6?`<li>Biaya admin ${t.tarif.persenBiayaLayananBulanan}%: ${i(t.biayaAdminTotal)}.</li>
      <li>Total potongan di muka ${t.tarif.persenBiayaLayananBulanan}% (${i(t.biayaLayananTotal)}) dipotong di muka dari dana yang diterima — biaya platform dihapus (0%).</li>`:`<li>Biaya layanan ${t.tarif.persenBiayaLayananBulanan}% dari pokok acuan: ${i(t.biayaLayananTotal)}, dipotong di muka dari dana yang diterima.</li>`)+(t.biayaAdminCicilanTotal>0?`<li>Biaya admin layanan cicilan ${t.tarif.persenBiayaAdminCicilanBulanan}% dari nominal cicilan: ${i(t.biayaAdminCicilanTotal)} selama ${t.tenorBulan} bulan (bulan pertama ${i(t.biayaAdminCicilanPerBulan)}), dibayar bersama setiap cicilan.</li>`:""),I=t===null?`
      <li>Biaya admin 2%: ${i(n.biayaAdmin)}.</li>
      ${n.biayaExpress>0?`<li>Biaya pencairan ekspres: ${i(n.biayaExpress)} (sekali, bukan bunga).</li>`:"<li>Pencairan ekspres tidak dipilih, jadi tidak ada biaya ekspres pada pinjaman ini.</li>"}
      <li>Total potongan di muka: ${i(n.totalPotonganDiMuka)} (biaya platform dihapus — 0%).</li>
      <li><strong>Perhitungan dana bersih: ${i(n.danaBersihDitransfer)} (pokok setelah seluruh potongan di muka)</strong>; dana diteruskan sesuai proses pencairan.</li>
      <li>Bunga: ${i(n.bunga)}.</li>
      <li><strong>Total kewajiban: ${i(n.totalKewajibanPelunasan)} (pokok + bunga)</strong>; nominal mengikuti perhitungan aplikasi.</li>`:`
      <li>Uang muka: ${i(t.dp)} — 0% dari pokok acuan.</li>
      ${A}
      <li><strong>Dana bersih yang diterima: ${i(t.danaDiterima)} (pokok ${i(t.pokokDibiayai)} setelah potongan di muka ${i(t.potonganDiMuka)})</strong>; dana diteruskan sesuai proses pencairan.</li>
      <li>Bunga/margin sebesar ${t.persenBungaPerBulan}% per bulan dari POKOK ACUAN (flat, tidak menurun dari sisa pokok); total ${i(t.bungaTotal)}.</li>
      <li><strong>Ilustrasi cicilan rata: bulan pertama ${i(t.cicilanPerBulan)}, bulan terakhir ${i(t.cicilanTerakhir)}; total ${i(t.totalPengembalian)} untuk ${t.tenorBulan} bulan (sudah termasuk pokok, bunga, dan biaya admin cicilan).</strong> Rincian per bulan: ${t.jadwal.map(c=>`bulan ${c.bulan} ${i(c.total)}`).join("; ")}. Jadwal bersifat ilustrasi; perubahan status lunas di aplikasi dicatat sebagai entri ledger.</li>`,j=t===null?`Kewajiban dilunasi dalam ${r} hari sejak tanggal pencairan. Pelunasan ditangani di luar aplikasi dan statusnya dicatat tim PINDAI pada ledger internal. ${l}`:`Cicilan bulanan dibayar sesuai jadwal pada Pasal 2. Setiap perubahan status dicatat pada ledger internal aplikasi. ${l}`;return`
  <div class="contract">
    ${f("pinjaman",d)}
    <h1>${$("pinjaman")}</h1>
    ${B()}

    <p>Perjanjian ini dibuat dan disetujui pada <strong>${u}</strong> atas data pengajuan yang tersimpan di aplikasi PINDAI.</p>
    <div class="info-grid">
      <section class="info-card">
        <h3>Informasi Dokumen</h3>
        <dl>
          <dt>Pihak Pertama</dt><dd>Pinjam Gadai Digital (PINDAI)</dd>
          <dt>Tanggal</dt><dd>${u}</dd>
          <dt>Nomor</dt><dd>${s(p("pinjaman",d.nomorReferensi))}</dd>
          <dt>Syarat</dt><dd>${o}</dd>
        </dl>
      </section>
      <section class="info-card">
        <h3>Pihak Kedua</h3>
        <dl>
          <dt>Nama</dt><dd>${s(k(a.namaLengkap))}</dd>
          ${a.nik?`<dt>NIK</dt><dd>${s(a.nik)}</dd>`:""}
          ${a.email?`<dt>Email</dt><dd>${s(a.email)}</dd>`:""}
          <dt>Rekening</dt><dd>${a.namaBank?`${s(a.namaBank)} · `:""}${s(a.nomorRekening)}</dd>
        </dl>
      </section>
    </div>
    <p class="muted">Data di atas berasal dari pengisian pada pengajuan.</p>

    <h2>Pasal 1 — Pokok, Tenor, dan Status</h2>
    <ol>
      <li>Pokok pinjaman: <strong>${i(n.pokok)}</strong>.</li>
      ${T}
      <li>Status pinjaman mengikuti pencatatan pada ledger internal aplikasi.</li>
    </ol>

    <h2>Pasal 2 — Biaya, Bunga, dan Total Kewajiban</h2>
    <ol>${I}
    </ol>
    <p><strong>Ringkasan rincian keuangan:</strong></p>
    ${t===null?L(n):x(t)}
    <div class="tagihan">
      <div>
        <span>${t===null?"Total kewajiban saat jatuh tempo":`Total pengembalian ${t.tenorBulan} bulan`}</span>
        <p>${t===null?`Pokok dan bunga, dibayar sekali pada akhir tenor ${r} hari.`:`Pokok, bunga, dan biaya admin cicilan selama ${t.tenorBulan} bulan.`}</p>
      </div>
      <strong>${i(t===null?n.totalKewajibanPelunasan:t.totalPengembalian)}</strong>
    </div>

    <h2>Pasal 3 — Cara dan Waktu Pelunasan</h2>
    <p>${j}</p>

    <h2>Pasal 4 — Persetujuan dan Tanda Tangan</h2>
    <p>${g(d)||"Persetujuan dinyatakan dengan menandai checkbox pada aplikasi."} Tanda tangan dapat dibubuhkan pada kanvas elektronik atau pada dokumen cetak ini secara manual. Versi syarat yang berlaku: <strong>${o}</strong>.</p>

    <h2>Pasal 5 — Data, Lokasi, dan Waktu</h2>
    <p>Timestamp sistem <strong>${new Date(d.timestampPada).toLocaleString("id-ID")}</strong>${d.lokasi?` dan koordinat perangkat yang dikirim <strong>${N(d.lokasi)}</strong>`:""} ditampilkan sebagai metadata masukan pengajuan.</p>

    <div class="ttd">
      ${y(k(a.namaLengkap),"Peminjam — Pihak Kedua",d)}
      ${b()}
    </div>
    ${v(d)}
    <div class="warning">
      <strong>Himbauan Keamanan Transaksi</strong>
      <p>PINDAI tidak pernah meminta kode OTP, PIN, atau kata sandi lewat WhatsApp maupun email.</p>
    </div>
    ${D()}
  </div>`}function M(a,n,d){const r=h(d.timestampPada),t=n.hargaPasar>0?Math.round(n.nilaiTaksiran/n.hargaPasar*100):0,e=n.pokokGadai!==void 0&&n.persenSewaModal!==void 0?w(n.pokokGadai,n.persenSewaModal):null,l=e===null?"<li>Pokok gadai dan sewa modal belum ditetapkan; belum ada hitungan yang dapat ditampilkan.</li>":`<li>Pokok gadai: <strong>${i(e.pokok)}</strong>.</li>
      <li>Potongan 1%: ${i(e.potonganDiMuka)}; nilai bersih (99%): <strong>${i(e.danaBersihDitransfer)}</strong>; dana diteruskan sesuai proses pencairan.</li>
      <li>Perhitungan sewa modal ${n.persenSewaModal}% per 30 hari dari sisa pokok; ilustrasi periode pertama ${i(e.sewaModalPeriode)}; nominal mengikuti perhitungan aplikasi.</li>`;return`
  <div class="contract">
    ${f("gadai",d)}
    <h1>${$("gadai")}</h1>
    ${B()}
    <p>Akad ini dibuat dan disetujui pada <strong>${r}</strong> atas data pengajuan yang tersimpan di aplikasi PINDAI.</p>
    <div class="info-grid">
      <section class="info-card">
        <h3>Informasi Dokumen</h3>
        <dl>
          <dt>Pihak Pertama</dt><dd>Pinjam Gadai Digital (PINDAI)</dd>
          <dt>Tanggal</dt><dd>${r}</dd>
          <dt>Nomor</dt><dd>${s(p("gadai",d.nomorReferensi))}</dd>
          <dt>Syarat</dt><dd>${o}</dd>
        </dl>
      </section>
      <section class="info-card">
        <h3>Pihak Kedua</h3>
        <dl>
          <dt>Nama</dt><dd>${s(k(a.namaLengkap))}</dd>
          ${a.nik?`<dt>NIK</dt><dd>${s(a.nik)}</dd>`:""}
          <dt>Rekening</dt><dd>${a.namaBank?`${s(a.namaBank)} · `:""}${s(a.nomorRekening)}</dd>
        </dl>
      </section>
    </div>
    <p class="muted">Data di atas berasal dari pengisian pada pengajuan.</p>

    <h2>Pasal 1 — Data Barang dan Lokasi Penyimpanan</h2>
    <ol>
      <li>Deskripsi barang: <strong>${s(n.deskripsiBarang)}</strong>.</li>
      <li>Kategori barang: ${s(n.kategori)}.</li>
      <li>Catatan kondisi fisik: ${s(n.kondisiFisik||"belum dicatat")}.</li>
      <li>Kode/referensi lokasi penyimpanan: <strong>${s(n.kodeRakVault)}</strong>; dipakai sebagai acuan penyimpanan barang pada akad ini.</li>
    </ol>

    <h2>Pasal 2 — Nilai Taksiran dan Pokok Gadai</h2>
    <ol>
      <li>Harga pasar yang dicantumkan: ${i(n.hargaPasar)}.</li>
      <li>Nilai taksiran: <strong>${i(n.nilaiTaksiran)}</strong> (LTV ${t}%, batas aplikasi ${n.ltvPersen}%); nilai taksiran ditetapkan tim PINDAI.</li>
      ${l}
    </ol>

    <h2>Pasal 3 — Penyimpanan dan Penyelesaian</h2>
    <ol>
      <li>Barang disimpan sesuai kode lokasi pada Pasal 1, dan serah terima barang dinyatakan dengan tanda terima terpisah.</li>
      <li>Pengembalian barang dilakukan setelah kewajiban dilunasi dan dikonfirmasi langsung dengan petugas PINDAI. Status siap diambil pada aplikasi menandai selesainya pencatatan pada ledger.</li>
      <li>Penyelesaian atau lelang jaminan dilaksanakan sesuai ketentuan yang berlaku; angka pada aplikasi menjadi acuan perhitungan.</li>
    </ol>

    <h2>Pasal 4 — Persetujuan dan Tanda Tangan</h2>
    <p>${g(d)||"Persetujuan dinyatakan dengan menandai checkbox pada aplikasi."} Tanda tangan dapat dibubuhkan pada kanvas elektronik atau pada dokumen cetak ini secara manual. Versi syarat yang berlaku: <strong>${o}</strong>.</p>

    <h2>Pasal 5 — Data, Lokasi, dan Waktu</h2>
    <p>Timestamp sistem <strong>${new Date(d.timestampPada).toLocaleString("id-ID")}</strong> dan koordinat yang tampil pada aplikasi adalah metadata yang dicatat pada pengajuan.</p>

    <div class="ttd">
      ${y(k(a.namaLengkap),"Peminjam — Pihak Kedua",d)}
      ${b()}
    </div>
    ${v(d)}
    <div class="warning">
      <strong>Himbauan Keamanan Transaksi</strong>
      <p>PINDAI tidak pernah meminta kode OTP, PIN, atau kata sandi lewat WhatsApp maupun email.</p>
    </div>
    ${D()}
  </div>`}export{o as C,M as a,E as b,$ as j,p as n};
