import {
  DEMO_CARD_NUMBER,
  hasNonPaymentCardPrefix,
  isLuhnValidCardNumber,
} from "./demoCardNumber";

const digits = DEMO_CARD_NUMBER.replace(/\s/g, "");
const tests: [string, boolean][] = [
  ["nomor demo berjumlah 16 digit", /^\d{16}$/.test(digits)],
  ["nomor demo memakai prefix non-pembayaran 9", hasNonPaymentCardPrefix(DEMO_CARD_NUMBER)],
  ["nomor demo gagal validasi Luhn", !isLuhnValidCardNumber(DEMO_CARD_NUMBER)],
  ["validator menerima penolakan nomor pendek", !isLuhnValidCardNumber("1234")],
  ["validator tidak menerima prefix pembayaran", !hasNonPaymentCardPrefix("5401 4001 1509 4787")],
];

let failed = 0;
for (const [label, passed] of tests) {
  if (!passed) {
    failed += 1;
    console.error(`FAIL ${label}`);
  }
}

console.log(`demoCardNumber.test: ${tests.length - failed} lulus, ${failed} gagal`);
if (failed > 0) process.exit(1);
