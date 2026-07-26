// Turning the listing images into the PNGs Etsy will accept.
//
// The mockups are built as SVG, because that is how they can embed the real
// pages at any size for nothing. Etsy only takes raster images. Until now the
// only converter was the dashboard: you opened the Shopfront and pressed "save
// pngs", and your browser did the work.
//
// That is fine, free, and in exactly the wrong order — the Shopkeeper creates
// the draft when you approve a listing, which is usually *before* anyone has
// pressed that button, so the draft went up with no pictures at all. An Etsy
// listing with no images cannot be published, so that draft was not much use.
//
// So: do it here when the machine can. Almost every desktop has Chrome or
// Edge, and either can rasterise an SVG faithfully with no libraries and no
// install. When there is no browser to be found we say so plainly and leave
// the one-click path alone rather than pretending.
import { spawn } from 'node:child_process';
import { existsSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { platform } from 'node:os';

/** Where a browser usually lives, per platform. */
function candidates() {
  const found = [];
  const push = (p) => p && found.push(p);

  if (process.env.CHROME_PATH) push(process.env.CHROME_PATH);

  // Playwright's cache, if this machine happens to have one.
  const pw = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  if (existsSync(pw)) {
    push(join(pw, 'chromium'));
    try {
      for (const dir of readdirSync(pw).filter((d) => d.startsWith('chromium'))) {
        push(join(pw, dir, 'chrome-linux', 'chrome'));
        push(join(pw, dir, 'chrome-mac', 'Chromium.app', 'Contents', 'MacOS', 'Chromium'));
      }
    } catch {
      // Unreadable cache directory is not worth failing over.
    }
  }

  if (platform() === 'darwin') {
    push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    push('/Applications/Chromium.app/Contents/MacOS/Chromium');
    push('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge');
    push('/Applications/Brave Browser.app/Contents/MacOS/Brave Browser');
  } else if (platform() === 'win32') {
    const programFiles = [process.env['PROGRAMFILES'], process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
    for (const base of programFiles) {
      push(join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'));
      push(join(base, 'Microsoft', 'Edge', 'Application', 'msedge.exe'));
      push(join(base, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'));
    }
  } else {
    push('/usr/bin/google-chrome');
    push('/usr/bin/google-chrome-stable');
    push('/usr/bin/chromium');
    push('/usr/bin/chromium-browser');
    push('/usr/bin/microsoft-edge');
    push('/snap/bin/chromium');
  }
  return found;
}

/** The browser this machine can use, or null. */
export function findBrowser() {
  return candidates().find((path) => existsSync(path)) || null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Convert SVG files to PNG using a local browser.
 *
 * Driven over the DevTools protocol rather than with `--screenshot`, because
 * that flag waits for the page to fall idle and gives no way to set the exact
 * output size. One browser is started for the whole batch.
 *
 * @param {{svgPath: string, pngPath: string, width?: number, height?: number}[]} jobs
 * @returns {Promise<{written: string[], failed: {path: string, why: string}[], browser: string|null}>}
 */
export async function rasterise(jobs = []) {
  const browser = findBrowser();
  if (!browser) {
    return {
      written: [],
      failed: jobs.map((j) => ({ path: j.pngPath, why: 'no browser found on this machine' })),
      browser: null,
    };
  }
  if (!jobs.length) return { written: [], failed: [], browser };

  const port = 9200 + Math.floor(Math.random() * 400);
  const child = spawn(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      `--remote-debugging-port=${port}`,
      'about:blank',
    ],
    { stdio: 'ignore' }
  );

  const written = [];
  const failed = [];
  let ws;

  try {
    // Wait for the browser to open its debugging port.
    let target = null;
    for (let i = 0; i < 80 && !target; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
        target = list.find((t) => t.type === 'page');
      } catch {
        // Not up yet.
      }
      if (!target) await sleep(250);
    }
    if (!target) throw new Error('the browser never opened its debugging port');

    ws = new WebSocket(target.webSocketDebuggerUrl);
    let id = 0;
    const pending = new Map();
    ws.addEventListener('message', (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        pending.get(message.id)(message);
        pending.delete(message.id);
      }
    });
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve);
      ws.addEventListener('error', () => reject(new Error('could not talk to the browser')));
    });

    const send = (method, params = {}) =>
      new Promise((resolve) => {
        const messageId = ++id;
        pending.set(messageId, resolve);
        ws.send(JSON.stringify({ id: messageId, method, params }));
      });

    await send('Page.enable');

    for (const job of jobs) {
      try {
        const width = job.width || 2400;
        const height = job.height || 1800;
        await send('Emulation.setDeviceMetricsOverride', {
          width,
          height,
          deviceScaleFactor: 1,
          mobile: false,
        });
        // file:// so the SVG is loaded exactly as written, with its embedded
        // logo and fonts, rather than re-encoded into a data URI.
        await send('Page.navigate', { url: `file://${job.svgPath}` });
        await sleep(450);
        const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
        const data = shot?.result?.data;
        if (!data) throw new Error('the browser returned no image');
        mkdirSync(dirname(job.pngPath), { recursive: true });
        writeFileSync(job.pngPath, Buffer.from(data, 'base64'));
        written.push(job.pngPath);
      } catch (err) {
        failed.push({ path: job.pngPath, why: err.message });
      }
    }
  } catch (err) {
    for (const job of jobs) {
      if (!written.includes(job.pngPath)) failed.push({ path: job.pngPath, why: err.message });
    }
  } finally {
    try {
      ws?.close();
    } catch {
      // Already gone.
    }
    child.kill();
  }

  return { written, failed, browser };
}

export default rasterise;
