export const DEMO_CARD_NUMBER = "9001 2345 6789 0123"; // nomor ilustrasi tidak valid, jangan diganti angka acak

function digitsOnly(value: string): string {
  return value.replace(/\s/g, "");
}

export function isLuhnValidCardNumber(value: string): boolean {
  const digits = digitsOnly(value);
  if (!/^\d{16}$/.test(digits)) return false;

  const sum = [...digits].reduce((total, character, index) => {
    let digit = Number(character);
    if ((digits.length - index) % 2 === 0) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    return total + digit;
  }, 0);

  return sum % 10 === 0;
}

export function hasNonPaymentCardPrefix(value: string): boolean {
  const digits = digitsOnly(value);
  return /^9\d{15}$/.test(digits) && !/^[2-6]/.test(digits);
}
