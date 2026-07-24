import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const templateRoot = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html", host: "localhost" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the AlphaSwipe product shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>AlphaSwipe — Swipe signals\. Trade the thesis\.<\/title>/i);
  assert.match(html, /Curated market signals/);
  assert.match(html, /AlphaSwipe/);
  assert.match(html, /Discover/);
  assert.match(html, /Position/);
  assert.match(html, /Settings/);
  assert.doesNotMatch(html, /Watchlist|Activity/);
  assert.match(html, /Injective Testnet/);
  assert.match(html, /\/og\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Building your site/i);
});

test("starter preview is removed and product assets are wired", async () => {
  const [page, layout, packageJson, newsData, injectiveClient] =
    await Promise.all([
      readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
      readFile(new URL("../package.json", import.meta.url), "utf8"),
      readFile(new URL("../app/news-data.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/injective-client.ts", import.meta.url), "utf8"),
    ]);

  assert.match(page, /<AlphaSwipeApp \/>/);
  assert.match(layout, /openGraph/);
  assert.match(layout, /summary_large_image/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(newsData, /category:\s*"crypto"/);
  assert.match(newsData, /category:\s*"rwa"/);
  assert.match(injectiveClient, /MsgCreateDerivativeMarketOrder/);
  assert.match(injectiveClient, /fetchPositionsV2/);
  assert.match(injectiveClient, /Network\.Testnet/);

  await assert.rejects(
    access(new URL("../app/_sites-preview", import.meta.url)),
  );
  await access(new URL("../public/og.png", import.meta.url));
  await access(new URL("../public/favicon.svg", import.meta.url));
  await access(new URL(".openai/hosting.json", templateRoot));
});
