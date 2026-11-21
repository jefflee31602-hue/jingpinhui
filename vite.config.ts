import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, Plugin} from 'vite';

const IMAGE_EXT_RE = /\.(png|jpe?g|webp|gif|svg)$/i;

function buildProductImagesManifest(productsDir: string) {
  const files: string[] = [];
  const bySku: Record<string, string> = {};

  if (!fs.existsSync(productsDir)) {
    return {files, bySku};
  }

  const entries = fs.readdirSync(productsDir, {withFileTypes: true});
  for (const entry of entries) {
    if (!entry.isFile() || !IMAGE_EXT_RE.test(entry.name)) continue;
    files.push(entry.name);
    const stem = entry.name.replace(/\.[^.]+$/, '').trim();
    const publicUrl = `/images/products/${encodeURIComponent(entry.name)}`;
    const exactUpper = stem.toUpperCase();
    const compact = exactUpper.replace(/[\s\-_]+/g, '');
    if (exactUpper && !bySku[exactUpper]) {
      bySku[exactUpper] = publicUrl;
    }
    if (compact && !bySku[compact]) {
      bySku[compact] = publicUrl;
    }
  }

  files.sort((a, b) => a.localeCompare(b));
  return {files, bySku};
}

function productImagesManifestPlugin(): Plugin {
  const productsDir = path.resolve(__dirname, 'public/images/products');
  return {
    name: 'product-images-manifest',
    configureServer(server) {
      server.middlewares.use('/images/products/manifest.json', (_req, res) => {
        const manifest = buildProductImagesManifest(productsDir);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(manifest));
      });
    },
    closeBundle(error?: Error): void {
      if (error) return;
      const outDir = path.resolve(__dirname, 'dist/images/products');
      fs.mkdirSync(outDir, {recursive: true});
      const manifest = buildProductImagesManifest(productsDir);
      fs.writeFileSync(
        path.join(outDir, 'manifest.json'),
        JSON.stringify(manifest),
        'utf8'
      );
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [
      react(),
      tailwindcss(),
      productImagesManifestPlugin(),
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
