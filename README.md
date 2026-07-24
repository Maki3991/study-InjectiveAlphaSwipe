# AlphaSwipe

AlphaSwipe turns crypto and real-world-asset news into a swipeable decision
feed. Swipe left to go long, right to go short, or up to skip; flip a card to
review the thesis, adjust notional and leverage, and submit a native Injective
perpetual market order.

## First-version scope

- Mobile-first card stack adapted from PaperSwipe
- Crypto and RWA signal filters
- Three-direction pointer, touch, and keyboard controls
- Discover, Position, and Settings navigation
- Live Injective Mainnet positions and unrealized PnL
- Keplr wallet connection
- Injective Mainnet derivative-market discovery, live orderbook lookup, gas
  simulation, signing, and broadcast
- Explicit real-funds warnings and wallet approval before Mainnet execution

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
