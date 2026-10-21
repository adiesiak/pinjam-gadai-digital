/**
 * Uji render pita biaya beranda (`BiayaBerlaku`).
 * Run: bun src/components/landing/BiayaBerlaku.render.test.tsx
 *
 * Yang dijaga: angka yang diiklankan di beranda berasal dari tarif admin yang
 * diteruskan, komponen yang tidak dipungut tidak disebut sebagai potongan, dan
 * tautannya menuju kalkulator biaya yang sebenarnya.
 */
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";

import { BiayaBerlaku } from "./BiayaBerlaku";
import { tarifBiayaDariAngka, type TarifBiaya } from "@/lib/loan";

let passed = 0;
let failed = 0;
function ok(syarat: boolean, label: string): void {
  if (syarat) passed += 1;
  else {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

function render(tarif: TarifBiaya): string {
  return renderToStaticMarkup(
    <MemoryRouter initialEntries={["/"]}>
      <BiayaBerlaku tarif={tarif} />
    </MemoryRouter>,
  );
}

const aktif = render(
  tarifBiayaDariAngka({
    adminPersen: 4,
    asuransiPersen: 1,
    ekspres1: 9_000,
    ekspres2: 9_000,
    ekspres3: 9_000,
  }),
);

ok(aktif.includes('id="biaya-title"'), "bagian punya judul yang bisa dirujuk");
ok(aktif.includes("Biaya admin"), "baris biaya admin tampil");
ok(aktif.includes("4% dari pokok"), "persen admin mengikuti tarif yang diberikan");
ok(
  !aktif.includes("2% dari pokok"),
  "persentase bawaan tidak tertinggal saat tarif berubah",
);
ok(aktif.includes("1% dari pokok"), "persen asuransi tampil saat dipungut");
ok(aktif.includes("Rp 9.000"), "nominal ekspres tampil dari tier yang berlaku");
ok(
  aktif.includes('href="/biaya"'),
  "tautan menghitung membawa ke halaman biaya",
);
ok(!aktif.includes("Tidak dipungut"), "tidak ada baris kosong saat semua dipungut");
ok(
  !aktif.includes("undefined") && !aktif.includes("[object Object]"),
  "tidak ada nilai kosong yang bocor ke markup",
);
ok(!aktif.includes("—"), "tidak memakai em dash");

const kosong = render(
  tarifBiayaDariAngka({
    adminPersen: 2,
    asuransiPersen: 0,
    ekspres1: 0,
    ekspres2: 0,
    ekspres3: 0,
  }),
);
ok(
  (kosong.match(/Tidak dipungut/g) ?? []).length === 2,
  "asuransi dan ekspres yang mati disebut tidak dipungut",
);
ok(!kosong.includes("asuransi 0%"), "asuransi nol tidak diiklankan sebagai potongan");
ok(!kosong.includes("Rp 0"), "tidak ada nominal nol yang ditampilkan");

console.log(
  `BiayaBerlaku.render: ${passed} lulus, ${failed} gagal`,
);
if (failed > 0) process.exit(1);
