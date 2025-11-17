import { build } from 'esbuild';

try {
  await build({
    entryPoints: ['server/index.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    outdir: 'dist',
    packages: 'external',
    sourcemap: true,
    logLevel: 'info',
    banner: {
      js: `
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
`
    }
  });
  console.log('✓ Server build complete');
  process.exit(0);
} catch (error) {
  console.error('✗ Build failed:', error);
  process.exit(1);
}
