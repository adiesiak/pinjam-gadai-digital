/** Format tanggal ringkas (id-ID) — dipakai tampilan Pendana. */
export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
