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
  assert.match(html, /AlphaSwipe/);
  assert.match(html, /class="deck-area"/);
  assert.match(html, /class="card-stack"/);
  assert.match(html, /Discover/);
  assert.match(html, /Position/);
  assert.match(html, /Settings/);
  assert.doesNotMatch(html, /Watchlist|Activity/);
  assert.match(html, /META, NVDA, AAPL, TSLA, BTC, ETH, BNB, and INJ/);
  assert.doesNotMatch(html, /MAINNET · REAL FUNDS/i);
  assert.doesNotMatch(html, /Focused signal feed/i);
  assert.doesNotMatch(html, /Tap details · Hold for AI · Swipe to trade/);
  assert.doesNotMatch(html, /Connect Keplr|Connect wallet/);
  assert.match(html, /\/og\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|Building your site/i);
});

test("starter preview is removed and product assets are wired", async () => {
  const [page, layout, packageJson, newsData, injectiveClient, swipeApp] =
    await Promise.all([
      readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
      readFile(new URL("../package.json", import.meta.url), "utf8"),
      readFile(new URL("../app/news-data.ts", import.meta.url), "utf8"),
      readFile(new URL("../lib/injective-client.ts", import.meta.url), "utf8"),
      readFile(new URL("../app/alpha-swipe-app.tsx", import.meta.url), "utf8"),
    ]);

  assert.match(page, /<AlphaSwipeApp \/>/);
  assert.match(layout, /openGraph/);
  assert.match(layout, /summary_large_image/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(newsData, /category:\s*"crypto"/);
  assert.match(newsData, /category:\s*"stock"/);
  for (const symbol of ["META", "NVDA", "AAPL", "TSLA", "BTC", "ETH", "BNB", "INJ"]) {
    assert.match(newsData, new RegExp(`marketQuery:\\s*"${symbol}"`));
  }
  assert.equal((newsData.match(/earnings:\s*\{/g) ?? []).length, 4);
  assert.match(injectiveClient, /MsgCreateDerivativeMarketOrder/);
  assert.match(injectiveClient, /MsgBroadcasterWithPk/);
  assert.match(injectiveClient, /PrivateKey\.fromHex/);
  assert.match(injectiveClient, /DERIVATIVE_MARKET_ORDER_TYPE/);
  assert.match(injectiveClient, /BUY:\s*1/);
  assert.match(injectiveClient, /SELL:\s*2/);
  assert.doesNotMatch(injectiveClient, /modules\.OrderType/);
  assert.match(injectiveClient, /fetchPositionsV2/);
  assert.match(injectiveClient, /Network\.Mainnet/);
  assert.doesNotMatch(injectiveClient, /Network\.Testnet|ChainId\.Testnet/);
  assert.match(injectiveClient, /derivativePriceFromChainPriceToFixed/);
  assert.doesNotMatch(injectiveClient, /WalletStrategy|Wallet\.Keplr/);
  assert.match(swipeApp, /LONG_PRESS_MS\s*=\s*560/);
  assert.match(swipeApp, /LOCAL_PRIVATE_KEY_STORAGE_KEY/);
  assert.match(swipeApp, /localStorage\.getItem/);
  assert.match(swipeApp, /localStorage\.setItem/);
  assert.match(swipeApp, /localStorage\.removeItem/);
  assert.match(swipeApp, /privateKeyRef/);
  assert.match(swipeApp, /openSignalChat/);
  assert.doesNotMatch(swipeApp, /className="app-topbar"|className="feed-meta"|className="mainnet-live"/);
  assert.doesNotMatch(swipeApp, /Connect Keplr|connectKeplr|order-sheet|quick-order/);
  assert.doesNotMatch(swipeApp, /className="swipe-actions"|className="gesture-hint"/);

  await assert.rejects(
    access(new URL("../app/_sites-preview", import.meta.url)),
  );
  await access(new URL("../public/og.png", import.meta.url));
  await access(new URL("../public/favicon.svg", import.meta.url));
  await access(new URL(".openai/hosting.json", templateRoot));
});
