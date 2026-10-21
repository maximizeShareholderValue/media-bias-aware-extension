/**
 * Drives Google Chrome for the browser-based tests (eval/gate3-timing.js, eval/browser-tests.js).
 *
 * DevTools protocol over --remote-debugging-pipe (Chrome reads fd 3, writes fd 4, messages end
 * with NUL). Branded Chrome ignores --load-extension, so the extension is loaded with
 * Extensions.loadUnpacked, which is only available on the pipe transport.
 * Not part of the shipped extension.
 */
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = path.join(__dirname, "..");
const DEFAULT_CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function launchChrome(chromePath) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "mbae-"));
  const chrome = spawn(chromePath || DEFAULT_CHROME, ["--headless=new", "--remote-debugging-pipe", "--enable-unsafe-extension-debugging",
    "--user-data-dir=" + profile, "--no-first-run", "about:blank"], { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] });
  const toChrome = chrome.stdio[3];
  const fromChrome = chrome.stdio[4];
  let id = 0;
  let buf = "";
  const waiting = {};
  fromChrome.on("data", (chunk) => {
    buf += chunk.toString("utf8");
    let i;
    while ((i = buf.indexOf("\0")) >= 0) {
      const d = JSON.parse(buf.slice(0, i));
      buf = buf.slice(i + 1);
      if (d.id && waiting[d.id]) {
        waiting[d.id](d);
        delete waiting[d.id];
      }
    }
  });
  const send = (method, params, sessionId) =>
    new Promise((r) => {
      const i = ++id;
      waiting[i] = r;
      toChrome.write(JSON.stringify(Object.assign({ id: i, method, params: params || {} }, sessionId ? { sessionId } : {})) + "\0");
    });
  const close = () => {
    chrome.kill();
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch (e) {
      /* Chrome may still hold files for a moment; the temp folder is cleaned by the OS. */
    }
  };
  return { chrome, send, close };
}

/** Opens a page target (and, with withExtension, loads the extension and attaches to its service worker). */
async function openBrowser(opts) {
  const b = launchChrome(opts && opts.chrome);
  const version = (await b.send("Browser.getVersion")).result;
  let swSession = null;
  if (opts && opts.withExtension) {
    const loaded = await b.send("Extensions.loadUnpacked", { path: ROOT });
    if (!loaded.result) throw new Error("could not load the extension: " + JSON.stringify(loaded.error));
    const extId = loaded.result.id;
    let sw;
    for (let i = 0; i < 60 && !sw; i++) {
      const t = (await b.send("Target.getTargets")).result.targetInfos;
      sw = t.find((x) => x.type === "service_worker" && x.url.startsWith("chrome-extension://" + extId + "/"));
      if (!sw) await sleep(250);
    }
    if (!sw) throw new Error("extension service worker not found - is the extension loading?");
    swSession = (await b.send("Target.attachToTarget", { targetId: sw.targetId, flatten: true })).result.sessionId;
  }
  let pageTarget = null;
  let pageSession = null;
  /** Closes the current test tab (if any) and opens a fresh one. */
  const newTab = async () => {
    if (pageTarget) await b.send("Target.closeTarget", { targetId: pageTarget });
    pageTarget = (await b.send("Target.createTarget", { url: "about:blank" })).result.targetId;
    pageSession = (await b.send("Target.attachToTarget", { targetId: pageTarget, flatten: true })).result.sessionId;
    await b.send("Page.enable", {}, pageSession);
    await b.send("Performance.enable", {}, pageSession);
  };
  await newTab();

  /** Evaluates an expression in the page (main world) and returns its value. */
  const page = async (expression) => {
    const r = await b.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true }, pageSession);
    if (r.result && r.result.exceptionDetails) throw new Error("page: " + JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    return r.result && r.result.result ? r.result.result.value : undefined;
  };

  /**
   * Sends a message to the content script of the tab whose run result title contains `title`
   * (the extension has no "tabs" permission, so tab URLs are not readable; titles are unique).
   */
  // A tab keeps its id after its result loses the title (e.g. highlights turned off), so remember it.
  const tabIds = {};
  const toTab = async (title, message) => {
    const known = tabIds[title];
    const expr = known
      ? "chrome.tabs.sendMessage(" + known + ", " + JSON.stringify(message) + ").then(r => ({ id: " + known + ", r }))"
      : "chrome.tabs.query({}).then(ts => Promise.all(ts.map(t => chrome.tabs.sendMessage(t.id, { type: 'GET_BIAS_SUMMARY' }).then(r => [t.id, r]).catch(() => [t.id, null]))))" +
        ".then(rs => { const hit = rs.find(([, r]) => r && r.result && r.result.title && r.result.title.indexOf(" + JSON.stringify(title) + ") >= 0);" +
        " if (!hit) return null; return chrome.tabs.sendMessage(hit[0], " + JSON.stringify(message) + ").then(r => ({ id: hit[0], r })); })";
    const res = await b.send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true }, swSession);
    const v = res.result && res.result.result ? res.result.result.value : null;
    if (!v) return null;
    tabIds[title] = v.id;
    return v.r;
  };

  /** Navigates and, with the extension, waits for its run result (or null after timeoutMs). */
  const load = async (url, title, timeoutMs) => {
    await b.send("Page.navigate", { url }, pageSession);
    if (!swSession) {
      for (let i = 0; i < 100; i++) {
        await sleep(50);
        if ((await page("document.readyState")) === "complete") break;
      }
      return null;
    }
    const until = Date.now() + (timeoutMs || 10000);
    while (Date.now() < until) {
      await sleep(50);
      const s = await toTab(title, { type: "GET_BIAS_SUMMARY" });
      if (s && s.result && typeof s.result.elapsedMs === "number") return s.result;
    }
    return null;
  };

  /** JS heap in use by the page's renderer after a forced garbage collection, in bytes. */
  const heapUsed = async () => {
    await b.send("HeapProfiler.collectGarbage", {}, pageSession);
    const m = (await b.send("Performance.getMetrics", {}, pageSession)).result.metrics;
    return (m.find((x) => x.name === "JSHeapUsedSize") || {}).value;
  };

  const navigate = (url) => b.send("Page.navigate", { url }, pageSession);

  return { send: b.send, close: b.close, version: version, page, toTab, load, navigate, heapUsed, newTab };
}

module.exports = { ROOT: ROOT, DEFAULT_CHROME: DEFAULT_CHROME, sleep: sleep, launchChrome: launchChrome, openBrowser: openBrowser };
