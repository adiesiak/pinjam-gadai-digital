/**
 * Penjaga payload klien → Convex.
 * Jalankan: bun scripts/qa-payload-klien.ts
 *
 * Kenapa ada: validator `v.object` Convex MENOLAK field tak dikenal, dan satu
 * field sisa membatalkan seluruh panggilan ("Object contains extra field `x`").
 * TypeScript menjaga objek literal biasa, tetapi dua pola lolos dan baru pecah
 * saat admin menekan tombol:
 *
 *   1. `...` yang menyebarkan objek bertipe lebih luas (baris server, state
 *      `Record<string, …>`) — spread tidak melewati excess-property check;
 *   2. `as` pada argumen — mematikan pemeriksaan tipe sepenuhnya.
 *
 * Skrip ini memakai type checker proyek: tipe argumen setiap pemanggilan
 * mutation/query dibandingkan dengan kunci `args` fungsi Convex yang dituju.
 * Keluar dengan kode 1 bila ada pelanggaran, sehingga ikut gagal di test.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = process.cwd();
const SCAN_PREFIXES = ["src/components/", "src/pages/", "src/hooks/"];

type Temuan = { file: string; line: number; target: string; jenis: string; pesan: string };

function rel(p: string): string {
  return path.relative(ROOT, p).split(path.sep).join("/");
}

function parse(file: string): ts.SourceFile {
  return ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

function namaProperti(node: ts.ObjectLiteralElementLike): string | null {
  if (ts.isPropertyAssignment(node)) {
    if (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) return node.name.text;
    return null;
  }
  if (ts.isShorthandPropertyAssignment(node)) return node.name.text;
  return null;
}

/** Kunci argumen tiap fungsi Convex, dibaca dari `args: { ... }` di sumber server. */
function bacaValidator(): Map<string, Set<string>> {
  const hasil = new Map<string, Set<string>>();
  const akar = path.join(ROOT, "src/convex");
  const berkas: string[] = [];
  const jelajah = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) jelajah(full);
      else if (/\.ts$/.test(entry.name) && !/\.test\./.test(entry.name)) berkas.push(full);
    }
  };
  jelajah(akar);

  for (const file of berkas) {
    const sf = parse(file);
    const mod = path.basename(file, ".ts");
    sf.forEachChild((node) => {
      if (!ts.isVariableStatement(node)) return;
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !decl.initializer) continue;
        const init = decl.initializer;
        if (!ts.isCallExpression(init) || !ts.isIdentifier(init.expression)) continue;
        if (
          init.expression.text !== "mutation" &&
          init.expression.text !== "query" &&
          init.expression.text !== "action"
        ) {
          continue;
        }
        const arg = init.arguments[0];
        if (!arg || !ts.isObjectLiteralExpression(arg)) continue;
        const argsProp = arg.properties.find(
          (p): p is ts.PropertyAssignment => ts.isPropertyAssignment(p) && namaProperti(p) === "args",
        );
        const keys = new Set<string>();
        if (argsProp && ts.isObjectLiteralExpression(argsProp.initializer)) {
          for (const p of argsProp.initializer.properties) {
            const k = namaProperti(p);
            if (k) keys.add(k);
          }
        }
        hasil.set(`${mod}.${decl.name.text}`, keys);
      }
    });
  }
  return hasil;
}

const validator = bacaValidator();
const temuan: Temuan[] = [];

const configPath = path.join(ROOT, "tsconfig.app.json");
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
if (configFile.error) {
  console.error(`Gagal membaca ${rel(configPath)}`);
  process.exit(1);
}
const parsed = ts.parseJsonConfigFileContent(configFile.config, ts.sys, ROOT);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();

for (const sf of program.getSourceFiles()) {
  const file = rel(sf.fileName);
  if (sf.isDeclarationFile) continue;
  if (!SCAN_PREFIXES.some((p) => file.startsWith(p))) continue;
  if (/\.test\./.test(file)) continue;

  const lineOf = (node: ts.Node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;

  /**
   * Resolusi handle lewat SIMBOL, bukan nama variabel.
   *
   * Versi sebelumnya menyimpan `Map<nama, handle>` per berkas, sehingga dua
   * komponen di berkas yang sama dengan nama variabel sama (mis. `simpan` di
   * `contract-views.tsx` untuk `setujuiPerjanjianPinjaman` dan
   * `setujuiPerjanjianGadai`) saling menimpa: pemanggilan yang benar dilaporkan
   * sebagai "KUNCI EKSTRA" karena dibandingkan dengan validator fungsi lain.
   * `getSymbolAtLocation` menunjuk deklarasi yang benar-benar terlihat di titik
   * pemanggilan, jadi shadowing tidak lagi mengaburkan hasil.
   */
  const handleDariIdent = (ident: ts.Identifier): { target: string; jenis: string } | null => {
    const simbol = checker.getSymbolAtLocation(ident);
    const decl = simbol?.valueDeclaration;
    if (!decl || !ts.isVariableDeclaration(decl) || !decl.initializer) return null;
    const init = decl.initializer;
    if (!ts.isCallExpression(init) || !ts.isIdentifier(init.expression)) return null;
    const hook = init.expression.text;
    const target = init.arguments[0]?.getText(decl.getSourceFile()) ?? "";
    const m = /^(?:api|internal)\.(\w+)\.(\w+)$/.exec(target);
    const jenis =
      hook === "useMutation" ? "mutation" : hook === "useQuery" ? "query" : hook === "useAction" ? "action" : null;
    if (jenis === null || !m) return null;
    return { target: `${m[1]}.${m[2]}`, jenis };
  };

  /**
   * `as` pada SELURUH payload mematikan pemeriksaan tipe untuk bentuk objeknya.
   * `as` pada satu nilai (mis. `id as Id<"users">`) hanya menegaskan tipe nilai
   * dan tidak bisa menyembunyikan field ekstra, jadi tidak dipersoalkan.
   */
  const payloadDicas = (expr: ts.Expression): string | null => {
    let node = expr;
    while (ts.isParenthesizedExpression(node)) node = node.expression;
    if (ts.isAsExpression(node) || ts.isSatisfiesExpression(node)) {
      return node.getText(sf).slice(0, 70);
    }
    return null;
  };

  const telusuriPanggilan = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
      const h = handleDariIdent(node.expression);
      if (h) {
        const line = lineOf(node);
        const arg = node.arguments[0];
        const kunci = validator.get(h.target);
        if (!kunci) {
          // Validator tidak ditemukan (mis. internal.*): tidak bisa dibandingkan.
        } else if (!arg) {
          if (kunci.size > 0) {
            temuan.push({
              file,
              line,
              target: h.target,
              jenis: h.jenis,
              pesan: `dipanggil tanpa argumen padahal validator punya ${kunci.size} kunci`,
            });
          }
        } else {
          const cast = payloadDicas(arg);
          if (cast !== null) {
            temuan.push({
              file,
              line,
              target: h.target,
              jenis: h.jenis,
              pesan: `payload memakai \`as\` — pemeriksaan tipe dimatikan: ${cast}`,
            });
          }

          const tipe = checker.getTypeAtLocation(arg);
          if ((tipe.flags & ts.TypeFlags.Any) !== 0) {
            temuan.push({
              file,
              line,
              target: h.target,
              jenis: h.jenis,
              pesan: "tipe argumen `any` — kunci tidak bisa diperiksa",
            });
          } else {
            const indeks = checker.getIndexInfoOfType(tipe, ts.IndexKind.String);
            if (indeks) {
              temuan.push({
                file,
                line,
                target: h.target,
                jenis: h.jenis,
                pesan:
                  "argumen bertipe index/Record — kunci tak terbatas, bisa memuat field ekstra",
              });
            }
            const properti = checker.getPropertiesOfType(tipe).map((p) => p.name);
            const ekstra = properti.filter(
              (k) => !kunci.has(k) && !k.startsWith("__") && k !== "prototype",
            );
            if (ekstra.length > 0) {
              temuan.push({
                file,
                line,
                target: h.target,
                jenis: h.jenis,
                pesan: `KUNCI EKSTRA ${JSON.stringify(ekstra)} — validator menolak seluruh panggilan`,
              });
            }
          }
        }
      }
    }
    ts.forEachChild(node, telusuriPanggilan);
  };
  telusuriPanggilan(sf);
}

console.log(`qa-payload-klien: ${temuan.length} pelanggaran`);
for (const t of temuan) console.log(`✗ ${t.file}:${t.line} ${t.target} (${t.jenis}) — ${t.pesan}`);
if (temuan.length > 0) process.exit(1);
