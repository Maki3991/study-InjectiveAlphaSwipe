export type NewsCategory = "crypto" | "rwa";

export type NewsTheme = "cyan" | "violet" | "coral" | "gold" | "blue";

export type NewsItem = {
  id: string;
  category: NewsCategory;
  title: string;
  hook: string;
  summary: string;
  source: string;
  published: string;
  sourceUrl: string;
  tags: string[];
  marketQuery: string;
  marketLabel: string;
  impact: "High" | "Medium";
  confidence: number;
  horizon: string;
  bullCase: string;
  bearCase: string;
  catalyst: string;
  risk: string;
  theme: NewsTheme;
};

export const NEWS_ITEMS: NewsItem[] = [
  {
    id: "inj-x402",
    category: "crypto",
    title: "x402 payments are live on Injective mainnet",
    hook: "AI agents can now pay for APIs in USDC and settle onchain in about 650ms.",
    summary:
      "Injective says x402 lets an agent price, pay for and receive data in one request. That turns machine-to-machine payments into a native demand surface for the network.",
    source: "Injective",
    published: "Jun 8 · 4 min",
    sourceUrl: "https://injective.com/blog/",
    tags: ["AI agents", "Payments", "USDC"],
    marketQuery: "INJ",
    marketLabel: "INJ / USDC PERP",
    impact: "High",
    confidence: 82,
    horizon: "1–4 weeks",
    bullCase:
      "Usage moves from narrative to measurable transactions as agents pay for data and execution.",
    bearCase:
      "Developer attention may not translate into sustained fee demand or liquidity.",
    catalyst: "Mainnet integrations and agent transaction growth",
    risk: "Early adoption data is still limited",
    theme: "cyan",
  },
  {
    id: "inj-asia-regulated",
    category: "crypto",
    title: "INJ gains a new regulated access route in Asia",
    hook: "The asset joins a smaller group with regulated access across both the U.S. and Asia.",
    summary:
      "Broader regulated distribution can expand the addressable investor base, but the signal matters only if it converts into flows and deeper market liquidity.",
    source: "Injective",
    published: "Jun 4 · 3 min",
    sourceUrl: "https://injective.com/blog/",
    tags: ["Regulation", "Asia", "INJ"],
    marketQuery: "INJ",
    marketLabel: "INJ / USDC PERP",
    impact: "High",
    confidence: 78,
    horizon: "2–8 weeks",
    bullCase:
      "New compliant access channels can support incremental institutional demand.",
    bearCase:
      "Regulatory availability does not guarantee near-term allocations or spot buying.",
    catalyst: "Product inflows and regional exchange volumes",
    risk: "Headline may be priced before meaningful flows arrive",
    theme: "violet",
  },
  {
    id: "inj-mcp-trading",
    category: "crypto",
    title: "Injective opens natural-language perpetual trading to agents",
    hook: "The MCP stack can open and close perpetual positions, move tokens and pull live market data.",
    summary:
      "The release packages market discovery and transaction execution into reusable agent skills. It is a direct bet that trading interfaces become conversational and autonomous.",
    source: "Injective",
    published: "Jun 1 · 3 min",
    sourceUrl: "https://injective.com/blog/",
    tags: ["MCP", "Perps", "Automation"],
    marketQuery: "INJ",
    marketLabel: "INJ / USDC PERP",
    impact: "Medium",
    confidence: 74,
    horizon: "1–3 months",
    bullCase:
      "A simpler execution layer attracts new builders and increases onchain trading activity.",
    bearCase:
      "Agent trading remains a niche interface without differentiated liquidity or strategies.",
    catalyst: "Third-party agent integrations",
    risk: "Execution safety and permission design",
    theme: "blue",
  },
  {
    id: "rwa-third-pillar",
    category: "rwa",
    title: "Tokenization is becoming crypto’s third structural pillar",
    hook: "Coinbase Research frames RWAs alongside stablecoins and native crypto assets heading into 2026.",
    summary:
      "The thesis is shifting from isolated token launches to distribution, liquidity and composability. That favors venues where tokenized assets can immediately be traded and used as collateral.",
    source: "Coinbase Research",
    published: "2026 outlook · 8 min",
    sourceUrl:
      "https://www.coinbase.com/institutional/research-insights/research/market-intelligence/major-trends-in-tokenization",
    tags: ["Tokenization", "Institutions", "RWA"],
    marketQuery: "META",
    marketLabel: "META / USDC PERP",
    impact: "High",
    confidence: 80,
    horizon: "3–12 months",
    bullCase:
      "Institutional products bring durable assets, distribution and collateral utility onchain.",
    bearCase:
      "Fragmented standards and thin secondary liquidity slow real adoption.",
    catalyst: "Fund launches, AUM growth and collateral integrations",
    risk: "Regulatory and distribution bottlenecks",
    theme: "gold",
  },
  {
    id: "iaa-programmable",
    category: "rwa",
    title: "iAssets turn stocks and commodities into programmable markets",
    hook: "Injective’s design treats RWAs as composable instruments instead of passive 1:1 wrappers.",
    summary:
      "iAssets combine oracle pricing, the exchange module and shared liquidity so an instrument can be traded, hedged or used in structured strategies from day one.",
    source: "Injective Research",
    published: "Research note · 12 min",
    sourceUrl:
      "https://injective.com/blog/injective-i-assets-programmable-real-world-assets",
    tags: ["iAssets", "Equities", "Composability"],
    marketQuery: "AAPL",
    marketLabel: "AAPL / USDC PERP",
    impact: "High",
    confidence: 76,
    horizon: "1–6 months",
    bullCase:
      "24/7 access and shared liquidity create a differentiated venue for global equity exposure.",
    bearCase:
      "Oracle coverage and off-hours liquidity can widen spreads and basis risk.",
    catalyst: "New iAsset markets and liquidity programs",
    risk: "Oracle, basis and market-hours mismatch",
    theme: "coral",
  },
  {
    id: "inj-regulated-futures",
    category: "rwa",
    title: "The first U.S.-regulated INJ futures go live",
    hook: "A CFTC-regulated venue now offers a derivatives route for institutional and retail exposure.",
    summary:
      "A regulated futures product gives traditional participants another way to express views on INJ and can improve price discovery between onchain and regulated venues.",
    source: "Injective",
    published: "Apr 15 · 3 min",
    sourceUrl: "https://injective.com/blog/",
    tags: ["Futures", "CFTC", "Institutions"],
    marketQuery: "INJ",
    marketLabel: "INJ / USDC PERP",
    impact: "Medium",
    confidence: 73,
    horizon: "1–3 months",
    bullCase:
      "Regulated derivatives expand access and support more sophisticated hedging demand.",
    bearCase:
      "Volume may remain concentrated on existing offshore and onchain venues.",
    catalyst: "Open interest and cross-venue basis",
    risk: "Low initial volume",
    theme: "violet",
  },
];
