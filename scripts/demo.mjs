#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT) || 4321;
const demoPath = '/examples/shop-demo.html';

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

await ensureBuilt();

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
  console.log('Open it in Chrome with the built-in AI flags enabled. Press Ctrl+C to stop.');
  openBrowser(url);
});
