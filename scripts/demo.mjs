#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT) || 4321;

const DEMOS = {
  basic: '/examples/basic.html',
  shop: '/examples/shop-demo.html',
  'security-audit': '/examples/security-audit-demo.html',
};

const extraArgs = process.argv.slice(2);
const watchMode = extraArgs.includes('--watch');
const demoArg = extraArgs.find((arg) => !arg.startsWith('--'));
const demoPath = !demoArg ? DEMOS.shop : (DEMOS[demoArg] ?? `/${demoArg.replace(/^\/+/, '')}`);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

async function ensureBuilt() {
  try {
    await stat(resolve(root, 'dist', 'index.js'));
  } catch {
    console.log('dist/ not found — building the library first...');
    await new Promise((resolvePromise, rejectPromise) => {
      const build = spawn('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: true });
      build.on('exit', (code) => {
        if (code === 0) {
          resolvePromise();
        } else {
          rejectPromise(new Error(`build failed with exit code ${code}`));
        }
      });
    });
  }
}

/**
 * Runs `tsc --watch` directly (bypassing `npm run build`'s `prebuild` -> `npm run
 * clean` step), so edits to `src/` recompile incrementally instead of a full
 * clean-and-rebuild on every save. Resolves once the first compile finishes, so the
 * server never serves a stale/missing `dist/` on startup; keeps recompiling in the
 * background afterward for every subsequent edit.
 */
function startWatchBuild() {
  return new Promise((resolveBuild, rejectBuild) => {
    const watcher = spawn(
      'npx',
      ['tsc', '-p', 'tsconfig.build.json', '--watch', '--preserveWatchOutput'],
      { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] },
    );
    let firstCompileDone = false;

    watcher.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      process.stdout.write(text);

      if (!firstCompileDone && /Found \d+ errors?\. Watching for file changes\./.test(text)) {
        firstCompileDone = true;
        resolveBuild(watcher);
      }
    });

    watcher.on('exit', (code) => {
      if (!firstCompileDone) {
        rejectBuild(
          new Error(`tsc --watch exited with code ${code} before finishing an initial build`),
        );
      }
    });
  });
}

function resolveSafePath(requestPath) {
  const decoded = decodeURIComponent(requestPath === '/' ? demoPath : requestPath);
  const target = resolve(root, `.${decoded}`);

  if (target !== root && !target.startsWith(root + sep)) {
    return null;
  }

  return target;
}

function openBrowser(url) {
  const isWindows = process.platform === 'win32';
  const command = process.platform === 'darwin' ? 'open' : isWindows ? 'start' : 'xdg-open';
  const args = isWindows ? ['', url] : [url];

  spawn(command, args, { shell: isWindows, stdio: 'ignore', detached: true }).unref();
}

let watcher;

if (watchMode) {
  console.log('Building once, then watching src/ for changes (incremental, no clean)...');
  watcher = await startWatchBuild();
} else {
  await ensureBuilt();
}

const server = createServer(async (req, res) => {
  const requestPath = new URL(req.url ?? '/', 'http://localhost').pathname;
  const filePath = resolveSafePath(requestPath);

  if (!filePath) {
    res.writeHead(400);
    res.end('Bad request');
    return;
  }

  try {
    const contents = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': mimeTypes[extname(filePath)] ?? 'application/octet-stream',
    });
    res.end(contents);
  } catch {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(port, () => {
  const url = `http://localhost:${port}${demoPath}`;
  console.log(`@pilmee/ai demo running at ${url}`);
  console.log(
    `Other demos, same server: ${Object.entries(DEMOS)
      .map(([name, path]) => `${name} (http://localhost:${port}${path})`)
      .join(', ')}`,
  );
  console.log(
    watchMode
      ? 'Watching src/ — edits to the library recompile automatically; just reload the page.'
      : 'Edited src/? Re-run with --watch, or `npm run build` and reload the page to pick it up.',
  );
  console.log('Open it in Chrome with the built-in AI flags enabled. Press Ctrl+C to stop.');
  openBrowser(url);
});

function shutdown() {
  watcher?.kill();
  server.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
