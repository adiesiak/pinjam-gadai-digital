/**
 * Tautan lewati navigasi untuk pengguna keyboard dan pembaca layar.
 *
 * Tersembunyi sampai menerima fokus, lalu muncul di kiri atas dengan latar
 * aksen penuh. Targetnya `#konten`, yang sudah memakai `tabIndex={-1}` di
 * halaman peminjam, landing, dan ruang pendana.
 */
export function SkipLink() {
  return (
    <a
      href="#konten"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-primary-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
    >
      Lewati ke konten
    </a>
  );
}
