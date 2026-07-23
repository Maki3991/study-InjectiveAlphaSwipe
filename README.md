# AlphaSwipe

AlphaSwipe turns crypto and real-world-asset news into a swipeable decision
feed. Swipe to skip, watch, go long, or go short; flip a card to review the
thesis, adjust notional and leverage, and submit a native Injective perpetual
market order.

## First-version scope

- Mobile-first card stack adapted from PaperSwipe
- Crypto and RWA signal filters
- Four-direction pointer, touch, button, and keyboard controls
- Local watchlist and transaction activity
- Keplr wallet connection
- Injective Testnet derivative-market discovery, live orderbook lookup, gas
  simulation, signing, and broadcast
- Testnet-only execution guardrail

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

The product currently ships with a small editorial seed feed. A later backend
can replace `app/news-data.ts` with live news ingestion and ranking without
changing the swipe or execution flow.
