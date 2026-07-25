export type NewsCategory = "crypto" | "stock";

export type NewsTheme = "cyan" | "violet" | "coral" | "gold" | "blue";

export type SignalSymbol =
  | "META"
  | "NVDA"
  | "AAPL"
  | "TSLA"
  | "BTC"
  | "ETH"
  | "BNB"
  | "INJ";

export type EarningsAnalysis = {
  period: string;
  headline: string;
  metrics: { label: string; value: string; change: string }[];
  analysis: string;
  nextWatch: string;
};

export type SignalDirection = "long" | "short" | "neutral";

export type SignalDegree = "strong" | "moderate" | "weak";

export type ResearchMetric = {
  label: string;
  value: string;
  change?: string;
  tone?: "positive" | "negative" | "neutral";
};

export type SignalResearch = {
  signal: {
    direction: SignalDirection;
    degree: SignalDegree;
    label: string;
    confidence: number;
    description: string;
  };
  macro: string;
  industry: {
    name: string;
    summary: string;
  };
  fundamentals: {
    overview: string;
    recentMarket: string;
    recentEarnings: string;
    metrics: ResearchMetric[];
  };
  risks: string[];
  dataAsOf: string;
};

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
  marketQuery: SignalSymbol;
  marketLabel: string;
  impact: "High" | "Medium";
  confidence: number;
  horizon: string;
  bullCase: string;
  bearCase: string;
  catalyst: string;
  risk: string;
  theme: NewsTheme;
  earnings?: EarningsAnalysis;
  analysis?: SignalResearch;
};

export const ALLOWED_SYMBOLS: SignalSymbol[] = [
  "META",
  "NVDA",
  "AAPL",
  "TSLA",
  "BTC",
  "ETH",
  "BNB",
  "INJ",
];

export const NEWS_ITEMS: NewsItem[] = [
  {
    id: "meta-q1-2026",
    category: "stock",
    title: "Meta’s revenue accelerates while AI investment keeps costs elevated",
    hook: "Q1 revenue grew 33% year over year, with operating margin holding at 41%.",
    summary:
      "Meta delivered strong advertising-led growth while continuing to fund AI infrastructure and superintelligence products. Reported EPS was helped by a large tax benefit, so operating income is the cleaner read on underlying performance.",
    source: "Meta Investor Relations",
    published: "Apr 29, 2026",
    sourceUrl:
      "https://investor.atmeta.com/investor-news/press-release-details/2026/Meta-Reports-First-Quarter-2026-Results/default.aspx",
    tags: ["Earnings", "AI capex", "Advertising"],
    marketQuery: "META",
    marketLabel: "META / USDC PERP",
    impact: "High",
    confidence: 86,
    horizon: "1–8 weeks",
    bullCase:
      "Revenue and operating income are compounding above 30% while the core ads engine funds long-duration AI investment.",
    bearCase:
      "Costs grew slightly faster than revenue and headline EPS overstates underlying profit growth because of a one-time tax benefit.",
    catalyst: "Next-quarter ad growth, AI product engagement and capex guidance",
    risk: "AI infrastructure returns lag the pace of spending",
    theme: "violet",
    earnings: {
      period: "Q1 2026",
      headline: "Operating momentum is real; reported EPS needs normalization.",
      metrics: [
        { label: "Revenue", value: "$56.3B", change: "+33% YoY" },
        { label: "Operating income", value: "$22.9B", change: "+30% YoY" },
        { label: "Operating margin", value: "41%", change: "Flat YoY" },
        { label: "Diluted EPS", value: "$10.44", change: "+62% YoY" },
      ],
      analysis:
        "The 33% revenue increase and 30% operating-income increase show broad operating leverage, but costs rose 35%. An $8.03B income-tax benefit lifted reported EPS, so the 41% operating margin is the more comparable signal.",
      nextWatch:
        "Ad pricing and impressions, infrastructure capex, Reality Labs losses and evidence that new AI products create incremental monetization.",
    },
  },
  {
    id: "nvda-q1-fy2027",
    category: "stock",
    title: "NVIDIA’s AI-factory cycle drives another record quarter",
    hook: "Fiscal Q1 revenue reached $81.6B, led by $75.2B of Data Center revenue.",
    summary:
      "NVIDIA’s growth remains concentrated in accelerated-computing infrastructure. Demand is exceptionally strong, but the valuation debate now depends on sustaining hyperscaler spending and navigating export restrictions.",
    source: "NVIDIA Investor Relations",
    published: "May 20, 2026",
    sourceUrl:
      "https://investor.nvidia.com/news/press-release-details/2026/NVIDIA-Announces-Financial-Results-for-First-Quarter-Fiscal-2027/default.aspx",
    tags: ["Earnings", "AI factories", "Data Center"],
    marketQuery: "NVDA",
    marketLabel: "NVDA / USDC PERP",
    impact: "High",
    confidence: 90,
    horizon: "1–8 weeks",
    bullCase:
      "Data Center growth of 92% and a 75% gross margin show that AI infrastructure demand remains both large and highly profitable.",
    bearCase:
      "Customer concentration, export controls and increasingly difficult comparisons raise the cost of any guidance miss.",
    catalyst: "Vera Rubin ramp, hyperscaler capex and fiscal Q2 guidance",
    risk: "AI spending normalizes faster than supply and expectations",
    theme: "cyan",
    earnings: {
      period: "Q1 FY2027",
      headline: "Growth and margins remain exceptional, with expectations equally elevated.",
      metrics: [
        { label: "Revenue", value: "$81.6B", change: "+85% YoY" },
        { label: "Data Center", value: "$75.2B", change: "+92% YoY" },
        { label: "GAAP gross margin", value: "74.9%", change: "+14.4 pts" },
        { label: "GAAP diluted EPS", value: "$2.39", change: "+214% YoY" },
      ],
      analysis:
        "The quarter confirms that AI compute demand is still expanding faster than NVIDIA’s already enlarged base. The main analytical question is no longer near-term demand, but how long customers can sustain this capex intensity.",
      nextWatch:
        "Fiscal Q2 revenue guidance, China exposure, Blackwell/Rubin supply, networking growth and customer concentration.",
    },
  },
  {
    id: "aapl-fy26-q2",
    category: "stock",
    title: "Apple posts its strongest March quarter as iPhone and Services expand",
    hook: "Revenue rose to $111.2B with double-digit growth across every geographic segment.",
    summary:
      "Apple’s fiscal second quarter combined renewed iPhone growth with another record Services result. The mix supports margins and recurring revenue, while the next debate is whether the product cycle can sustain this pace.",
    source: "Apple Newsroom",
    published: "Apr 30, 2026",
    sourceUrl:
      "https://www.apple.com/ca/newsroom/2026/04/apple-reports-second-quarter-results/",
    tags: ["Earnings", "iPhone", "Services"],
    marketQuery: "AAPL",
    marketLabel: "AAPL / USDC PERP",
    impact: "High",
    confidence: 84,
    horizon: "1–8 weeks",
    bullCase:
      "Broad geographic growth, a stronger iPhone cycle and recurring Services revenue support durable cash generation.",
    bearCase:
      "A strong product cycle raises the comparison bar while regulation and platform changes can pressure Services economics.",
    catalyst: "Product-cycle demand, Services mix and forward guidance",
    risk: "Hardware demand normalizes after the current upgrade cycle",
    theme: "blue",
    earnings: {
      period: "FY2026 Q2",
      headline: "Broad growth plus a richer Services mix improves earnings quality.",
      metrics: [
        { label: "Revenue", value: "$111.2B", change: "+16.6% YoY" },
        { label: "iPhone revenue", value: "$57.0B", change: "+21.7% YoY" },
        { label: "Services revenue", value: "$31.0B", change: "+16.3% YoY" },
        { label: "Diluted EPS", value: "$2.01", change: "+21.8% YoY" },
      ],
      analysis:
        "Growth was not isolated to one geography or one segment. Services continued to expand recurring revenue, while iPhone produced the largest absolute upside. That combination is supportive, though expectations now embed a healthier upgrade cycle.",
      nextWatch:
        "iPhone sell-through, Services regulation, gross-margin guidance, Greater China demand and AI product monetization.",
    },
  },
  {
    id: "tsla-q2-2026",
    category: "stock",
    title: "Tesla’s deliveries rebound, but operating profit remains under pressure",
    hook: "Q2 revenue grew 26% while operating income fell to $398M.",
    summary:
      "Tesla’s top line recovered on higher deliveries and services growth, but heavier AI, R&D and compensation spending compressed operating leverage. The quarter separates improving volume from still-fragile profitability.",
    source: "Tesla 10-Q",
    published: "Jul 22, 2026",
    sourceUrl:
      "https://www.sec.gov/Archives/edgar/data/1318605/000162828026049270/tsla-20260630.htm",
    tags: ["Earnings", "Deliveries", "AI spending"],
    marketQuery: "TSLA",
    marketLabel: "TSLA / USDC PERP",
    impact: "High",
    confidence: 88,
    horizon: "1–8 weeks",
    bullCase:
      "Revenue, deliveries and services are growing again, while autonomy and energy create optionality beyond vehicle sales.",
    bearCase:
      "Operating income fell despite higher revenue as AI investment and compensation costs consumed the benefit of volume growth.",
    catalyst: "Robotaxi scaling, automotive margins and cash-flow conversion",
    risk: "Capital intensity rises before autonomy revenue becomes material",
    theme: "coral",
    earnings: {
      period: "Q2 2026",
      headline: "Volume recovered faster than profitability.",
      metrics: [
        { label: "Revenue", value: "$28.2B", change: "+26% YoY" },
        { label: "Gross profit", value: "$4.75B", change: "+23% YoY" },
        { label: "Operating income", value: "$398M", change: "−57% YoY" },
        { label: "Diluted EPS", value: "$0.32", change: "−3% YoY" },
      ],
      analysis:
        "The revenue rebound is constructive, but operating margin was only about 1.4%. R&D rose 49% and SG&A rose 45%, showing that AI, autonomy and compensation spending are arriving well before the full earnings contribution.",
      nextWatch:
        "Automotive gross margin excluding credits, Robotaxi utilization, 2026 capex above $25B and free-cash-flow durability.",
    },
  },
  {
    id: "btc-formal-verification",
    category: "crypto",
    title: "Bitcoin developers push formal verification deeper into protocol tooling",
    hook: "A new initiative aims to mathematically verify critical Bitcoin protocol behavior.",
    summary:
      "Formal verification is a long-duration infrastructure signal rather than a near-term price catalyst. Better assurance can reduce implementation risk for institutions and developers building around Bitcoin.",
    source: "Bitcoin Optech",
    published: "Jul 17, 2026",
    sourceUrl: "https://bitcoinops.org/en/newsletters/2026/07/17/",
    tags: ["Protocol", "Security", "Infrastructure"],
    marketQuery: "BTC",
    marketLabel: "BTC / USDC PERP",
    impact: "Medium",
    confidence: 76,
    horizon: "1–6 months",
    bullCase:
      "More rigorous protocol tooling strengthens Bitcoin’s credibility as settlement infrastructure.",
    bearCase:
      "Developer progress does not automatically create near-term demand or offset macro-driven selling.",
    catalyst: "Institutional positioning, liquidity and protocol-tool adoption",
    risk: "Macro deleveraging overwhelms incremental infrastructure progress",
    theme: "gold",
  },
  {
    id: "eth-2026-priorities",
    category: "crypto",
    title: "Ethereum’s 2026 roadmap centers on scaling, native accounts and interoperability",
    hook: "Protocol work builds on Pectra and Fusaka while targeting higher throughput and better UX.",
    summary:
      "Ethereum’s protocol agenda links blob scaling, account abstraction and cross-chain interoperability. Execution matters more than roadmap breadth: adoption must translate into sustainable blockspace demand.",
    source: "Ethereum Foundation",
    published: "Feb 18, 2026",
    sourceUrl:
      "https://blog.ethereum.org/2026/02/18/protocol-priorities-update-2026",
    tags: ["Scaling", "Account abstraction", "Interop"],
    marketQuery: "ETH",
    marketLabel: "ETH / USDC PERP",
    impact: "High",
    confidence: 82,
    horizon: "1–6 months",
    bullCase:
      "Higher throughput and native account features make Ethereum easier to use without abandoning its settlement role.",
    bearCase:
      "Scaling can move value capture away from L1 faster than demand expands.",
    catalyst: "Gas-limit increases, blob usage and account-abstraction adoption",
    risk: "Roadmap execution fragments across layers and clients",
    theme: "violet",
  },
  {
    id: "bnb-burn-36",
    category: "crypto",
    title: "BNB completes its 36th quarterly burn",
    hook: "More than 1.61M BNB was removed, leaving supply near 133.17M.",
    summary:
      "The burn mechanically reduces supply, but its price impact depends on network activity and whether demand grows alongside the deflationary schedule.",
    source: "BNB Chain",
    published: "Jul 15, 2026",
    sourceUrl: "https://www.bnbchain.org/en/blog/36th-bnb-burn",
    tags: ["Tokenomics", "Burn", "Supply"],
    marketQuery: "BNB",
    marketLabel: "BNB / USDC PERP",
    impact: "High",
    confidence: 84,
    horizon: "1–8 weeks",
    bullCase:
      "A predictable supply reduction compounds when paired with growing transaction and application demand.",
    bearCase:
      "The burn is anticipated and may have limited incremental impact without stronger onchain activity.",
    catalyst: "Network throughput, application activity and future burns",
    risk: "Supply narrative outpaces measurable demand",
    theme: "gold",
  },
  {
    id: "inj-x402",
    category: "crypto",
    title: "x402 payments bring machine-to-machine USDC settlement to Injective",
    hook: "AI agents can pay for APIs and receive data in one request, settled onchain.",
    summary:
      "Injective is positioning native finance infrastructure for autonomous agents. The investment signal depends on whether integrations produce durable transactions and fees rather than demos.",
    source: "Injective",
    published: "Jun 8, 2026",
    sourceUrl: "https://injective.com/blog/",
    tags: ["AI agents", "Payments", "USDC"],
    marketQuery: "INJ",
    marketLabel: "INJ / USDC PERP",
    impact: "High",
    confidence: 82,
    horizon: "1–12 weeks",
    bullCase:
      "Agent payments create a new transaction surface and reinforce Injective’s AI-native exchange positioning.",
    bearCase:
      "Developer attention may not translate into sustained fee demand or liquidity.",
    catalyst: "Agent integrations and machine-payment volume",
    risk: "Adoption remains experimental",
    theme: "cyan",
  },
];
