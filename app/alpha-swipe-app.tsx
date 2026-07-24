"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Check,
  CircleUserRound,
  Compass,
  ExternalLink,
  Flame,
  Layers3,
  ListFilter,
  LoaderCircle,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  TrendingDown,
  TrendingUp,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NEWS_ITEMS, type NewsCategory } from "./news-data";
import {
  connectKeplr,
  fetchDerivativePositions,
  placeDerivativeMarketOrder,
  type DerivativePosition,
  type OrderSide,
} from "@/lib/injective-client";

type ActiveTab = "discover" | "position" | "settings";
type FeedFilter = "all" | NewsCategory;
type Decision = "skip" | OrderSide;

type TradeRecord = {
  id: string;
  side: OrderSide;
  market: string;
  notional: number;
  leverage: number;
  txHash: string;
  createdAt: string;
};

const TRADES_STORAGE_KEY = "alphaswipe-trades-v1";

const filters: { id: FeedFilter; label: string }[] = [
  { id: "all", label: "All signals" },
  { id: "crypto", label: "Crypto" },
  { id: "rwa", label: "RWA" },
];

function shortAddress(address: string) {
  return `${address.slice(0, 7)}…${address.slice(-5)}`;
}

function actionLabel(action: Decision) {
  return {
    skip: "Skipped",
    long: "Long setup ready",
    short: "Short setup ready",
  }[action];
}

export function AlphaSwipeApp() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("discover");
  const [filter, setFilter] = useState<FeedFilter>("all");
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [drag, setDrag] = useState({ x: 0, y: 0 });
  const [exitAction, setExitAction] = useState<Decision | null>(null);
  const [trades, setTrades] = useState<TradeRecord[]>([]);
  const [positions, setPositions] = useState<DerivativePosition[]>([]);
  const [positionsBusy, setPositionsBusy] = useState(false);
  const [positionsError, setPositionsError] = useState("");
  const [orderSide, setOrderSide] = useState<OrderSide | null>(null);
  const [notional, setNotional] = useState(100);
  const [leverage, setLeverage] = useState(3);
  const [walletAddress, setWalletAddress] = useState("");
  const [walletBusy, setWalletBusy] = useState(false);
  const [tradeBusy, setTradeBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const pointer = useRef({
    active: false,
    x: 0,
    y: 0,
    startedAt: 0,
  });

  const filteredNews = useMemo(
    () =>
      filter === "all"
        ? NEWS_ITEMS
        : NEWS_ITEMS.filter((item) => item.category === filter),
    [filter],
  );
  const current = filteredNews[index] ?? null;
  const totalUnrealizedPnl = positions.reduce(
    (sum, position) => sum + position.unrealizedPnl,
    0,
  );
  const totalMargin = positions.reduce(
    (sum, position) => sum + position.margin,
    0,
  );
  const totalPositionValue = positions.reduce(
    (sum, position) => sum + position.quantity * position.markPrice,
    0,
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }, []);

  useEffect(() => {
    try {
      setTrades(JSON.parse(localStorage.getItem(TRADES_STORAGE_KEY) || "[]"));
    } catch {
      setTrades([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(TRADES_STORAGE_KEY, JSON.stringify(trades));
  }, [trades]);

  useEffect(() => {
    setIndex(0);
    setFlipped(false);
  }, [filter]);

  const advance = useCallback(
    (action: Decision) => {
      if (!current || exitAction) return;
      setExitAction(action);
      showToast(actionLabel(action));
      window.setTimeout(() => {
        setIndex((value) => value + 1);
        setFlipped(false);
        setDrag({ x: 0, y: 0 });
        setExitAction(null);
      }, 330);
    },
    [current, exitAction, showToast],
  );

  const decide = useCallback(
    (action: Decision) => {
      if (!current || exitAction) return;
      if (action === "long" || action === "short") {
        setOrderSide(action);
        setDrag({ x: 0, y: 0 });
        showToast(actionLabel(action));
        return;
      }
      advance(action);
    },
    [advance, current, exitAction, showToast],
  );

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        activeTab !== "discover" ||
        orderSide ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(
          (event.target as HTMLElement)?.tagName,
        )
      ) {
        return;
      }
      const keyMap: Record<string, Decision> = {
        ArrowLeft: "long",
        ArrowRight: "short",
        ArrowUp: "skip",
      };
      if (keyMap[event.key]) {
        event.preventDefault();
        decide(keyMap[event.key]);
      }
      if (event.key === " ") {
        event.preventDefault();
        setFlipped((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTab, decide, orderSide]);

  const refreshPositions = useCallback(
    async (address = walletAddress) => {
      if (!address) return;
      setPositionsBusy(true);
      setPositionsError("");
      try {
        setPositions(await fetchDerivativePositions(address));
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "持仓读取失败";
        setPositionsError(message);
        showToast(message);
      } finally {
        setPositionsBusy(false);
      }
    },
    [showToast, walletAddress],
  );

  useEffect(() => {
    if (activeTab === "position" && walletAddress) {
      void refreshPositions(walletAddress);
    }
  }, [activeTab, refreshPositions, walletAddress]);

  const connectWallet = async () => {
    if (walletAddress) return walletAddress;
    setWalletBusy(true);
    try {
      const address = await connectKeplr();
      setWalletAddress(address);
      showToast("Keplr connected · Injective Mainnet");
      return address;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "钱包连接失败");
      throw error;
    } finally {
      setWalletBusy(false);
    }
  };

  const executeOrder = async () => {
    if (!current || !orderSide || tradeBusy) return;
    setTradeBusy(true);
    try {
      const address = walletAddress || (await connectWallet());
      const result = await placeDerivativeMarketOrder({
        injectiveAddress: address,
        marketQuery: current.marketQuery,
        side: orderSide,
        notional,
        leverage,
      });
      const record: TradeRecord = {
        id: `${result.txHash}-${Date.now()}`,
        side: orderSide,
        market: result.ticker,
        notional,
        leverage,
        txHash: result.txHash,
        createdAt: new Date().toISOString(),
      };
      setTrades((items) => [record, ...items]);
      setOrderSide(null);
      showToast(`Order broadcast · ${result.txHash.slice(0, 10)}…`);
      advance(orderSide);
      void refreshPositions(address);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "订单提交失败");
    } finally {
      setTradeBusy(false);
    }
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest("button, a, input")) return;
    pointer.current = {
      active: true,
      x: event.clientX,
      y: event.clientY,
      startedAt: Date.now(),
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointer.current.active || flipped) return;
    setDrag({
      x: event.clientX - pointer.current.x,
      y: event.clientY - pointer.current.y,
    });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!pointer.current.active) return;
    pointer.current.active = false;
    const elapsed = Date.now() - pointer.current.startedAt;
    const distance = Math.hypot(drag.x, drag.y);
    if (distance < 9 && elapsed < 320) {
      setFlipped((value) => !value);
      setDrag({ x: 0, y: 0 });
      return;
    }
    if (Math.abs(drag.x) > 88 && Math.abs(drag.x) > Math.abs(drag.y)) {
      decide(drag.x < 0 ? "long" : "short");
    } else if (
      drag.y < -76 &&
      Math.abs(drag.y) > Math.abs(drag.x) * 0.75
    ) {
      decide("skip");
    }
    setDrag({ x: 0, y: 0 });
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture can already be released after a fast flick.
    }
  };

  const cardStyle = {
    "--drag-x": `${drag.x}px`,
    "--drag-y": `${drag.y}px`,
    "--drag-rotate": `${drag.x / 18}deg`,
  } as React.CSSProperties;

  return (
    <main className="app-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="app-topbar">
        <button
          className="icon-button"
          type="button"
          aria-label="Filter signals"
          onClick={() => setSearchOpen((value) => !value)}
        >
          {searchOpen ? <X /> : <Search />}
        </button>
        <button
          className="wordmark"
          type="button"
          onClick={() => setActiveTab("discover")}
          aria-label="AlphaSwipe discover"
        >
          <span className="brand-mark">
            <Layers3 />
          </span>
          <strong>AlphaSwipe</strong>
        </button>
        <button
          className={`wallet-pill ${walletAddress ? "is-connected" : ""}`}
          type="button"
          onClick={() => void connectWallet()}
          disabled={walletBusy}
          aria-label="Connect Keplr wallet"
        >
          {walletBusy ? <LoaderCircle className="spin" /> : <WalletCards />}
          <span>{walletAddress ? shortAddress(walletAddress) : "Connect"}</span>
        </button>
      </header>

      {searchOpen && (
        <section className="signal-filter-panel">
          <div>
            <span>Signal universe</span>
            <small>Crypto + tokenized real-world assets</small>
          </div>
          <div className="filter-row">
            {filters.map((item) => (
              <button
                key={item.id}
                className={filter === item.id ? "is-active" : ""}
                type="button"
                onClick={() => {
                  setFilter(item.id);
                  setSearchOpen(false);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="app-content">
        {activeTab === "discover" && (
          <section className="discover-view" aria-label="News signal feed">
            <div className="feed-meta">
              <div>
                <span className="live-dot" />
                <strong>Curated market signals</strong>
                <small>{filteredNews.length} stories in this deck</small>
              </div>
              <button type="button" onClick={() => setSearchOpen(true)}>
                <ListFilter />
                {filters.find((item) => item.id === filter)?.label}
              </button>
            </div>

            <div className="deck-area">
              <div className="card-stack">
                <div className="stack-card stack-card-two" />
                <div className="stack-card stack-card-one" />
                {current ? (
                  <article
                    className={`news-card theme-${current.theme} ${
                      flipped ? "is-flipped" : ""
                    } ${exitAction ? `exit-${exitAction}` : ""}`}
                    style={cardStyle}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerUp}
                    onPointerCancel={onPointerUp}
                  >
                    <div
                      className="swipe-stamp stamp-long"
                      style={{ opacity: Math.max(0, -drag.x / 90) }}
                    >
                      LONG
                    </div>
                    <div
                      className="swipe-stamp stamp-short"
                      style={{ opacity: Math.max(0, drag.x / 90) }}
                    >
                      SHORT
                    </div>
                    <div
                      className="swipe-stamp stamp-skip"
                      style={{ opacity: Math.max(0, -drag.y / 80) }}
                    >
                      SKIP
                    </div>
                    <div className="card-inner">
                      <div className="card-face card-front">
                        <div className="card-orbit orbit-one" />
                        <div className="card-orbit orbit-two" />
                        <div className="card-topline">
                          <span className="source-badge">{current.source}</span>
                          <span className="impact-badge">
                            <Flame />
                            {current.impact} impact
                          </span>
                        </div>
                        <div className="tag-line">
                          {current.tags.map((tag) => (
                            <span key={tag}>#{tag}</span>
                          ))}
                        </div>
                        <div className="card-copy">
                          <p>{current.hook}</p>
                          <h1>{current.title}</h1>
                        </div>
                        <div className="signal-strip">
                          <div>
                            <span className="market-symbol">
                              {current.marketQuery.slice(0, 2)}
                            </span>
                            <span>
                              <strong>{current.marketLabel}</strong>
                              <small>{current.published}</small>
                            </span>
                          </div>
                          <span className="confidence">
                            {current.confidence}%
                            <small>signal</small>
                          </span>
                        </div>
                        <div className="flip-hint">
                          <Sparkles />
                          Tap for thesis & trade setup
                        </div>
                      </div>

                      <div className="card-face card-back">
                        <div className="back-header">
                          <span className="source-badge">{current.marketLabel}</span>
                          <button
                            type="button"
                            onClick={() => setFlipped(false)}
                            aria-label="Flip to headline"
                          >
                            <X />
                          </button>
                          <h2>{current.title}</h2>
                          <p>{current.summary}</p>
                        </div>
                        <div className="back-scroll">
                          <div className="thesis-grid">
                            <div>
                              <span className="thesis-label bull">
                                <TrendingUp /> Bull case
                              </span>
                              <p>{current.bullCase}</p>
                            </div>
                            <div>
                              <span className="thesis-label bear">
                                <TrendingDown /> Bear case
                              </span>
                              <p>{current.bearCase}</p>
                            </div>
                          </div>
                          <div className="fact-row">
                            <div>
                              <small>Catalyst</small>
                              <strong>{current.catalyst}</strong>
                            </div>
                            <div>
                              <small>Key risk</small>
                              <strong>{current.risk}</strong>
                            </div>
                            <div>
                              <small>Horizon</small>
                              <strong>{current.horizon}</strong>
                            </div>
                          </div>
                          <div className="quick-order">
                            <div className="quick-order-heading">
                              <span>
                                <Zap /> One-tap setup
                              </span>
                              <small>Injective Mainnet</small>
                            </div>
                            <div className="order-controls">
                              <label>
                                <span>Notional</span>
                                <strong>${notional}</strong>
                                <input
                                  type="range"
                                  min="25"
                                  max="500"
                                  step="25"
                                  value={notional}
                                  onChange={(event) =>
                                    setNotional(Number(event.target.value))
                                  }
                                />
                              </label>
                              <label>
                                <span>Leverage</span>
                                <strong>{leverage}×</strong>
                                <input
                                  type="range"
                                  min="1"
                                  max="10"
                                  value={leverage}
                                  onChange={(event) =>
                                    setLeverage(Number(event.target.value))
                                  }
                                />
                              </label>
                            </div>
                            <div className="trade-buttons">
                              <button
                                className="long-button"
                                type="button"
                                onClick={() => setOrderSide("long")}
                              >
                                <ArrowUpRight /> Long
                              </button>
                              <button
                                className="short-button"
                                type="button"
                                onClick={() => setOrderSide("short")}
                              >
                                <ArrowDownRight /> Short
                              </button>
                            </div>
                          </div>
                          <a
                            className="source-link"
                            href={current.sourceUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Read original signal <ExternalLink />
                          </a>
                        </div>
                      </div>
                    </div>
                  </article>
                ) : (
                  <article className="deck-complete">
                    <span><Check /></span>
                    <h1>Signal deck cleared</h1>
                    <p>
                      You reviewed every story in this feed. Restart the deck
                      whenever you want another pass.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setIndex(0);
                        setFilter("all");
                      }}
                    >
                      Restart signals
                    </button>
                  </article>
                )}
              </div>

            </div>
          </section>
        )}

        {activeTab === "position" && (
          <section className="page-view position-view">
            <header className="page-heading">
              <div>
                <span>INJECTIVE MAINNET</span>
                <h1>Positions</h1>
              </div>
              {walletAddress ? (
                <button
                  className="refresh-positions"
                  type="button"
                  onClick={() => void refreshPositions()}
                  disabled={positionsBusy}
                >
                  <RefreshCw className={positionsBusy ? "spin" : ""} />
                  Refresh
                </button>
              ) : (
                <span className="network-chip"><i /> Mainnet</span>
              )}
            </header>

            {walletAddress ? (
              <>
                <div className="position-summary-card">
                  <div className="position-account">
                    <span>
                      <i />
                      {shortAddress(walletAddress)}
                    </span>
                    <small>Live indexer data</small>
                  </div>
                  <div className="pnl-hero">
                    <small>Total unrealized PnL</small>
                    <strong
                      className={
                        totalUnrealizedPnl >= 0 ? "is-profit" : "is-loss"
                      }
                    >
                      {totalUnrealizedPnl >= 0 ? "+" : "-"}$
                      {Math.abs(totalUnrealizedPnl).toFixed(2)}
                    </strong>
                  </div>
                  <div className="position-summary-stats">
                    <span>
                      <small>Open positions</small>
                      <strong>{positions.length}</strong>
                    </span>
                    <span>
                      <small>Position value</small>
                      <strong>${totalPositionValue.toFixed(2)}</strong>
                    </span>
                    <span>
                      <small>Margin</small>
                      <strong>${totalMargin.toFixed(2)}</strong>
                    </span>
                  </div>
                </div>
                <div className="section-title">
                  <span>Open positions</span>
                  <small>Mark-to-market PnL</small>
                </div>
                <div className="positions-scroll">
                  {positionsBusy && positions.length === 0 ? (
                    <div className="empty-state compact">
                      <LoaderCircle className="spin" />
                      <h2>Loading positions</h2>
                      <p>Reading your Injective Mainnet subaccounts.</p>
                    </div>
                  ) : positionsError ? (
                    <div className="empty-state compact">
                      <ShieldCheck />
                      <h2>Couldn’t load positions</h2>
                      <p>{positionsError}</p>
                      <button
                        type="button"
                        onClick={() => void refreshPositions()}
                      >
                        Try again
                      </button>
                    </div>
                  ) : positions.length ? (
                    positions.map((position) => (
                      <article
                        className="position-item"
                        key={`${position.marketId}-${position.side}`}
                      >
                        <div className="position-item-heading">
                          <span className={position.side}>
                            {position.side === "long" ? (
                              <TrendingUp />
                            ) : (
                              <TrendingDown />
                            )}
                          </span>
                          <div>
                            <strong>{position.ticker}</strong>
                            <small>
                              {position.side} · {position.leverage.toFixed(1)}×
                            </small>
                          </div>
                          <div className="position-pnl">
                            <small>Unrealized PnL</small>
                            <strong
                              className={
                                position.unrealizedPnl >= 0
                                  ? "is-profit"
                                  : "is-loss"
                              }
                            >
                              {position.unrealizedPnl >= 0 ? "+" : "-"}$
                              {Math.abs(position.unrealizedPnl).toFixed(2)}
                            </strong>
                          </div>
                        </div>
                        <div className="position-details">
                          <span>
                            <small>Quantity</small>
                            <strong>{position.quantity.toFixed(4)}</strong>
                          </span>
                          <span>
                            <small>Entry</small>
                            <strong>${position.entryPrice.toFixed(2)}</strong>
                          </span>
                          <span>
                            <small>Mark</small>
                            <strong>${position.markPrice.toFixed(2)}</strong>
                          </span>
                          <span>
                            <small>Liquidation</small>
                            <strong>
                              {position.liquidationPrice
                                ? `$${position.liquidationPrice.toFixed(2)}`
                                : "—"}
                            </strong>
                          </span>
                        </div>
                      </article>
                    ))
                  ) : (
                    <div className="empty-state compact">
                      <BarChart3 />
                      <h2>No open positions</h2>
                      <p>
                        Swipe left or right on a signal to create your first
                        Mainnet position.
                      </p>
                      <button
                        type="button"
                        onClick={() => setActiveTab("discover")}
                      >
                        Discover signals
                      </button>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="position-connect-state">
                <span><BarChart3 /></span>
                <h2>See every position and PnL</h2>
                <p>
                  Connect Keplr to read live Injective Mainnet positions,
                  mark prices and unrealized profit or loss.
                </p>
                <button type="button" onClick={() => void connectWallet()}>
                  <WalletCards />
                  Connect Keplr
                </button>
                <small>Read-only until you approve a trade in your wallet.</small>
              </div>
            )}
          </section>
        )}

        {activeTab === "settings" && (
          <section className="page-view settings-view">
            <header className="page-heading">
              <div>
                <span>PRODUCT PREVIEW</span>
                <h1>Settings</h1>
              </div>
              <CircleUserRound />
            </header>
            <div className="settings-scroll">
              <section className="settings-profile">
                <span><Layers3 /></span>
                <div>
                  <strong>AlphaSwipe Trader</strong>
                  <small>Crypto + RWA discovery</small>
                </div>
              </section>
              <section className="settings-card">
                <div className="settings-title">
                  <div>
                    <h2>Execution network</h2>
                    <p>Orders use Injective’s native exchange module.</p>
                  </div>
                  <ShieldCheck />
                </div>
                <div className="network-setting">
                  <span><i /> Injective Mainnet</span>
                  <small>injective-1</small>
                </div>
                <p className="settings-note">
                  Mainnet is active. Orders use real funds, are simulated for
                  gas, and require an explicit Keplr signature before broadcast.
                </p>
              </section>
              <section className="settings-card">
                <div className="settings-title">
                  <div>
                    <h2>Default trade setup</h2>
                    <p>Used whenever you swipe left or right.</p>
                  </div>
                  <Settings />
                </div>
                <label className="setting-range">
                  <span>Notional <strong>${notional}</strong></span>
                  <input
                    type="range"
                    min="25"
                    max="500"
                    step="25"
                    value={notional}
                    onChange={(event) => setNotional(Number(event.target.value))}
                  />
                </label>
                <label className="setting-range">
                  <span>Leverage <strong>{leverage}×</strong></span>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={leverage}
                    onChange={(event) => setLeverage(Number(event.target.value))}
                  />
                </label>
              </section>
              <section className="risk-note">
                <ShieldCheck />
                <p>
                  News signals are research prompts, not financial advice.
                  Perpetuals are leveraged products and can liquidate quickly.
                </p>
              </section>
            </div>
          </section>
        )}
      </section>

      <nav className="bottom-nav" aria-label="Primary navigation">
        <button
          className={activeTab === "discover" ? "is-active" : ""}
          type="button"
          onClick={() => setActiveTab("discover")}
        >
          <Compass /><span>Discover</span>
        </button>
        <button
          className={activeTab === "position" ? "is-active" : ""}
          type="button"
          onClick={() => setActiveTab("position")}
        >
          <BarChart3 /><span>Position</span>
        </button>
        <button
          className={activeTab === "settings" ? "is-active" : ""}
          type="button"
          onClick={() => setActiveTab("settings")}
        >
          <Settings /><span>Settings</span>
        </button>
      </nav>

      {orderSide && current && (
        <div className="sheet-backdrop" role="presentation">
          <section
            className="order-sheet"
            role="dialog"
            aria-modal="true"
            aria-label={`${orderSide} order confirmation`}
          >
            <div className="sheet-handle" />
            <div className="order-sheet-heading">
              <div>
                <span className={orderSide}>
                  {orderSide === "long" ? <TrendingUp /> : <TrendingDown />}
                </span>
                <div>
                  <small>MARKET ORDER · MAINNET</small>
                  <h2>{orderSide === "long" ? "Long" : "Short"} {current.marketLabel}</h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOrderSide(null)}
                aria-label="Close order sheet"
              >
                <X />
              </button>
            </div>
            <div className="order-summary">
              <div><small>Notional</small><strong>${notional}.00</strong></div>
              <div><small>Leverage</small><strong>{leverage}×</strong></div>
              <div><small>Est. margin</small><strong>${(notional / leverage).toFixed(2)}</strong></div>
              <div><small>Max slippage</small><strong>0.50%</strong></div>
            </div>
            <div className="execution-note">
              <ShieldCheck />
              <p>
                AlphaSwipe will resolve the active {current.marketQuery} perpetual
                market, read the live orderbook, simulate gas, and ask Keplr to
                sign one native Injective Mainnet market order using real funds.
              </p>
            </div>
            <button
              className={`execute-button ${orderSide}`}
              type="button"
              onClick={() => void executeOrder()}
              disabled={tradeBusy || walletBusy}
            >
              {tradeBusy || walletBusy ? (
                <LoaderCircle className="spin" />
              ) : (
                <Zap />
              )}
              {tradeBusy
                ? "Preparing Injective order…"
                : walletAddress
                  ? `Sign & open ${orderSide}`
                  : `Connect Keplr & open ${orderSide}`}
            </button>
            <p className="order-disclaimer">
              Mainnet · real funds · wallet approval required
            </p>
          </section>
        </div>
      )}

      <div className={`toast ${toast ? "is-visible" : ""}`} role="status">
        {toast}
      </div>
    </main>
  );
}
