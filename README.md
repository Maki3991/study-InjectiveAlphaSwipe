# AlphaSwipe

AlphaSwipe turns focused stock and crypto news into a swipeable decision feed.
Swipe left to go long, right to go short, or up to skip on Injective Mainnet.
Tap a card to inspect its thesis, or hold it to open a contextual Signal AI
discussion.

## First-version scope

- Mobile-first card stack adapted from PaperSwipe
- A fixed signal universe: META, NVDA, AAPL, TSLA, BTC, ETH, BNB, and INJ
- Live, source-restricted RSS refresh with editorial fallbacks
- Earnings metrics and analysis for every stock signal
- Three-direction pointer, touch, and keyboard controls
- Discover, Position, and Settings navigation
- Live Injective Mainnet positions and unrealized PnL
- In-memory private-key signing with no wallet connection
- Injective Mainnet derivative-market discovery, live orderbook lookup, gas
  simulation, signing, and broadcast
- Direct broadcast on horizontal swipe, with no second confirmation
- Tap-only details and long-press contextual Signal AI

## Private-key safety

The private key is held only in the active browser tab's React memory. It is
not sent to the AlphaSwipe server, written to local storage, or restored after
a refresh. Direct signing removes the protection of a wallet confirmation
screen, so use a dedicated low-balance Injective trading account rather than a
primary wallet.

## Run locally

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Validation

```bash
npm run build
npm test
npx tsc --noEmit
```

`app/api/signals/route.ts` refreshes one source-restricted headline for each
approved symbol and falls back to the verified editorial analysis in
`app/news-data.ts` when a feed is unavailable.
