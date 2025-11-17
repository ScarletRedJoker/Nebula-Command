import { build } from 'esbuild';

const banner = {
  js: `
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
`
};

try {
  // Build main server bundle (excluding vite.dev.js since it's only used in dev)
  await build({
    entryPoints: ['server/index.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outdir: 'dist',
    packages: 'external',
    external: ['./vite.dev.js'],
    sourcemap: true,
    logLevel: 'info',
    banner
  });

  // Build vite.dev.ts separately WITHOUT bundling
  // (so it can import vite which is a devDependency)
  await build({
    entryPoints: ['server/vite.dev.ts'],
    bundle: false,
    platform: 'node',
    format: 'esm',
    outdir: 'dist/server',
    packages: 'external',
    sourcemap: true,
    logLevel: 'info',
    banner
  });

  console.log('✓ Server build complete');
  process.exit(0);
} catch (error) {
  console.error('✗ Build failed:', error);
  process.exit(1);
}
