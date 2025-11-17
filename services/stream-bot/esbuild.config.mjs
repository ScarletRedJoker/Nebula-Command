import { build } from 'esbuild';
import { glob } from 'glob';

try {
  // Find all TypeScript files in server/ and shared/ directories
  const serverFiles = await glob('server/**/*.ts', { ignore: ['**/*.test.ts', '**/*.spec.ts'] });
  const sharedFiles = await glob('shared/**/*.ts', { ignore: ['**/*.test.ts', '**/*.spec.ts'] });
  const allFiles = [...serverFiles, ...sharedFiles];

  console.log(`Found ${allFiles.length} TypeScript files to transpile`);

  await build({
    entryPoints: allFiles,
    bundle: true, // Bundle to resolve @shared/* path aliases
    packages: 'external', // Externalize all node_modules packages (best practice for Node.js)
    platform: 'node',
    format: 'esm',
    outdir: 'dist',
    outbase: '.', // Preserve directory structure
    sourcemap: true,
    logLevel: 'info',
    target: 'es2022',
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
  console.log('✓ Server build complete (bundled with externalized dependencies)');
  process.exit(0);
} catch (error) {
  console.error('✗ Build failed:', error);
  process.exit(1);
}
