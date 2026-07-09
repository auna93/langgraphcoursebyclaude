#!/usr/bin/env node
/**
 * Copia los assets de Pyodide (paquete npm `pyodide`) a `public/pyodide/`
 * para que se sirvan self-hosted, mismo origen (CA-10, ADR-01).
 *
 * Uso:
 *   npm run copy-pyodide
 * (Se ejecuta manualmente tras `npm install`. No es un postinstall automático
 * para no penalizar cada instalación de dependencias con la copia de ~12 MB;
 * el runner (S6) documentará si conviene automatizarlo como postinstall.)
 *
 * Requiere que `pyodide` esté instalado en node_modules (dependencia del
 * proyecto, ver package.json). Si falta, el script termina con un mensaje
 * explicando cómo instalarlo.
 */
import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const srcDir = join(repoRoot, "node_modules", "pyodide");
const destDir = join(repoRoot, "public", "pyodide");

function fail(message) {
  console.error(`[copy-pyodide] ${message}`);
  process.exit(1);
}

if (!existsSync(srcDir)) {
  fail(
    'No se encontró node_modules/pyodide. Instala la dependencia primero: "npm install" ' +
      "(pyodide está declarado en package.json#dependencies).",
  );
}

function copyRecursive(src, dest) {
  const entry = statSync(src);
  if (entry.isDirectory()) {
    mkdirSync(dest, { recursive: true });
    for (const child of readdirSync(src)) {
      copyRecursive(join(src, child), join(dest, child));
    }
  } else {
    copyFileSync(src, dest);
  }
}

// Assets de runtime que el worker necesita cargar desde el mismo origen.
// (No copiamos package.json/README/consola de demo/sourcemaps/tipos del
// paquete npm, solo los binarios y metadatos de carga de Pyodide.)
const RUNTIME_EXTENSIONS = [".js", ".mjs", ".wasm", ".json", ".zip", ".whl"];
const EXCLUDED_SUFFIXES = [".map", ".d.ts"];
const EXCLUDED_FILES = ["package.json"]; // metadatos npm, no runtime

function isAsset(filename) {
  if (EXCLUDED_FILES.includes(filename)) return false;
  if (EXCLUDED_SUFFIXES.some((suffix) => filename.endsWith(suffix))) return false;
  const startsWithPyodideOrStdlib =
    filename.startsWith("pyodide") || filename.endsWith("_stdlib.zip");
  const hasRuntimeExtension = RUNTIME_EXTENSIONS.some((ext) => filename.endsWith(ext));
  return startsWithPyodideOrStdlib && hasRuntimeExtension;
}

if (existsSync(destDir)) {
  rmSync(destDir, { recursive: true, force: true });
}
mkdirSync(destDir, { recursive: true });

let copied = 0;
for (const entryName of readdirSync(srcDir)) {
  const srcPath = join(srcDir, entryName);
  if (statSync(srcPath).isFile() && isAsset(entryName)) {
    copyRecursive(srcPath, join(destDir, entryName));
    copied += 1;
  }
}

if (copied === 0) {
  fail(
    `No se copió ningún asset desde ${srcDir}. Revisa la estructura del paquete pyodide ` +
      "instalado (puede haber cambiado de versión) y ajusta ASSET_GLOBS en este script.",
  );
}

console.log(`[copy-pyodide] Copiados ${copied} archivos a ${destDir}`);
