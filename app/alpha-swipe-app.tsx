"use client";

import {
  ArrowDownRight,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  Bookmark,
  Check,
  ChevronDown,
  CircleUserRound,
  Compass,
  ExternalLink,
  Flame,
  Layers3,
  ListFilter,
  LoaderCircle,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Star,
  TrendingDown,
  TrendingUp,
  WalletCards,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NEWS_ITEMS, type NewsCategory, type NewsItem } from "./news-data";
import {
  connectKeplr,
  placeDerivativeMarketOrder,
  type OrderSide,
} from "@/lib/injective-client";

type ActiveTab = "discover" | "watchlist" | "portfolio" | "settings";
type FeedFilter = "all" | NewsCategory;
type Decision = "skip" | "watch" | OrderSide;

type TradeRecord = {
  id: string;
  side: OrderSide;
  market: string;
  notional: number;
  leverage: number;
  txHash: string;
  createdAt: string;
};

const WATCHLIST_STORAGE_KEY = "alphaswipe-watchlist-v1";
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
    watch: "Added to watchlist",
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
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [trades, setTrades] = useState<TradeRecord[]>([]);
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
  const watchedItems = NEWS_ITEMS.filter((item) => watchlist.includes(item.id));

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }, []);

  useEffect(() => {
    try {
      setWatchlist(
        JSON.parse(localStorage.getItem(WATCHLIST_STORAGE_KEY) || "[]"),
      );
      setTrades(JSON.parse(localStorage.getItem(TRADES_STORAGE_KEY) || "[]"));
    } catch {
      setWatchlist([]);
      setTrades([]);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(WATCHLIST_STORAGE_KEY, JSON.stringify(watchlist));
  }, [watchlist]);

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
      if (action === "watch") {
        setWatchlist((items) =>
          items.includes(current.id) ? items : [...items, current.id],
        );
      }
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
        ArrowLeft: "skip",
        ArrowRight: "long",
        ArrowUp: "watch",
        ArrowDown: "short",
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

  const connectWallet = async () => {
    if (walletAddress) return walletAddress;
    setWalletBusy(true);
    try {
      const address = await connectKeplr();
      setWalletAddress(address);
      showToast("Keplr connected · Injective Testnet");
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
    } catch (error) {
      showToast(error instanceof Error ? error.message : "订单提交失败");
    } finally {
      setTradeBusy(false);
    }
  };

  const removeWatch = (id: string) => {
    setWatchlist((items) => items.filter((item) => item !== id));
    showToast("Removed from watchlist");
  };

  const selectWatchItem = (item: NewsItem) => {
    const nextFilter: FeedFilter = "all";
    const nextIndex = NEWS_ITEMS.findIndex((candidate) => candidate.id === item.id);
    setFilter(nextFilter);
    setIndex(nextIndex);
    setActiveTab("discover");
    setFlipped(false);
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
      decide(drag.x > 0 ? "long" : "skip");
    } else if (
      Math.abs(drag.y) > 76 &&
      Math.abs(drag.y) > Math.abs(drag.x) * 0.75
    ) {
      decide(drag.y < 0 ? "watch" : "short");
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
                      className="swipe-stamp stamp-skip"
                      style={{ opacity: Math.max(0, -drag.x / 90) }}
                    >
                      SKIP
                    </div>
                    <div
                      className="swipe-stamp stamp-long"
                      style={{ opacity: Math.max(0, drag.x / 90) }}
                    >
                      LONG
                    </div>
                    <div
                      className="swipe-stamp stamp-watch"
                      style={{ opacity: Math.max(0, -drag.y / 80) }}
                    >
                      WATCH
                    </div>
                    <div
                      className="swipe-stamp stamp-short"
                      style={{ opacity: Math.max(0, drag.y / 80) }}
                    >
                      SHORT
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
                              <small>Injective Testnet</small>
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
                      You reviewed every story in this feed. Open your watchlist
                      or restart the deck.
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

              <div className="deck-progress">
                <span>
                  {current ? Math.min(index + 1, filteredNews.length) : filteredNews.length}
                  <small> / {filteredNews.length}</small>
                </span>
                <div>
                  <i
                    style={{
                      width: `${
                        filteredNews.length
                          ? (Math.min(index + 1, filteredNews.length) /
                              filteredNews.length) *
                            100
                          : 0
                      }%`,
                    }}
                  />
                </div>
              </div>
            </div>

            <div className="swipe-actions">
              <button
                className="skip-action"
                type="button"
                onClick={() => decide("skip")}
                aria-label="Skip signal"
              >
                <X />
                <span>Skip</span>
              </button>
              <button
                className="watch-action"
                type="button"
                onClick={() => decide("watch")}
                aria-label="Watch signal"
              >
                <Star />
                <span>Watch</span>
              </button>
              <button
                className="short-action"
                type="button"
                onClick={() => decide("short")}
                aria-label="Open short setup"
              >
                <TrendingDown />
                <span>Short</span>
              </button>
              <button
                className="long-action"
                type="button"
                onClick={() => decide("long")}
                aria-label="Open long setup"
              >
                <TrendingUp />
                <span>Long</span>
              </button>
            </div>
            <div className="gesture-hint">
              <span><ArrowLeft /> Skip</span>
              <span><ArrowUp /> Watch</span>
              <span><ChevronDown /> Short</span>
              <span><ArrowRight /> Long</span>
            </div>
          </section>
        )}

        {activeTab === "watchlist" && (
          <section className="page-view">
            <header className="page-heading">
              <div>
                <span>YOUR SIGNAL QUEUE</span>
                <h1>Watchlist</h1>
              </div>
              <strong>{watchedItems.length}</strong>
            </header>
            <div className="insight-banner">
              <Sparkles />
              <div>
                <strong>
                  {watchedItems.length
                    ? `${watchedItems.length} catalysts worth tracking`
                    : "Your watchlist is clear"}
                </strong>
                <span>
                  Signals stay on this device until you remove them.
                </span>
              </div>
            </div>
            <div className="list-scroll">
              {watchedItems.length ? (
                watchedItems.map((item) => (
                  <article className="watch-item" key={item.id}>
                    <button
                      className={`watch-visual theme-${item.theme}`}
                      type="button"
                      onClick={() => selectWatchItem(item)}
                    >
                      {item.marketQuery.slice(0, 2)}
                    </button>
                    <button
                      className="watch-copy"
                      type="button"
                      onClick={() => selectWatchItem(item)}
                    >
                      <span>{item.source} · {item.published}</span>
                      <h2>{item.title}</h2>
                      <small>{item.marketLabel} · {item.horizon}</small>
                    </button>
                    <button
                      className="remove-button"
                      type="button"
                      onClick={() => removeWatch(item.id)}
                      aria-label={`Remove ${item.title}`}
                    >
                      <X />
                    </button>
                  </article>
                ))
              ) : (
                <div className="empty-state">
                  <Bookmark />
                  <h2>Nothing saved yet</h2>
                  <p>Swipe up on a signal to keep it on your radar.</p>
                  <button type="button" onClick={() => setActiveTab("discover")}>
                    Explore signals
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        {activeTab === "portfolio" && (
          <section className="page-view">
            <header className="page-heading">
              <div>
                <span>INJECTIVE TESTNET</span>
                <h1>Activity</h1>
              </div>
              <span className="network-chip"><i /> Connected</span>
            </header>
            <div className="portfolio-card">
              <div>
                <small>Trading account</small>
                <strong>
                  {walletAddress ? shortAddress(walletAddress) : "Not connected"}
                </strong>
              </div>
              <button type="button" onClick={() => void connectWallet()}>
                <WalletCards />
                {walletAddress ? "Wallet ready" : "Connect Keplr"}
              </button>
              <div className="portfolio-stats">
                <span><strong>{trades.length}</strong>orders</span>
                <span><strong>${trades.reduce((sum, trade) => sum + trade.notional, 0)}</strong>notional</span>
                <span><strong>{watchlist.length}</strong>watched</span>
              </div>
            </div>
            <div className="section-title">
              <span>Recent broadcasts</span>
              <small>Local activity log</small>
            </div>
            <div className="list-scroll activity-list">
              {trades.length ? (
                trades.map((trade) => (
                  <article className="trade-item" key={trade.id}>
                    <span className={trade.side}>
                      {trade.side === "long" ? <TrendingUp /> : <TrendingDown />}
                    </span>
                    <div>
                      <strong>{trade.market}</strong>
                      <small>
                        ${trade.notional} · {trade.leverage}× · {trade.side}
                      </small>
                    </div>
                    <a
                      href={`https://testnet.explorer.injective.network/transaction/${trade.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink />
                    </a>
                  </article>
                ))
              ) : (
                <div className="empty-state compact">
                  <Zap />
                  <h2>No orders yet</h2>
                  <p>Your signed Testnet broadcasts will appear here.</p>
                </div>
              )}
            </div>
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
                  <span><i /> Injective Testnet</span>
                  <small>injective-888</small>
                </div>
                <p className="settings-note">
                  Testnet is locked for this first version. Every order is
                  simulated for gas, then requires an explicit Keplr signature
                  before broadcast.
                </p>
              </section>
              <section className="settings-card">
                <div className="settings-title">
                  <div>
                    <h2>Default trade setup</h2>
                    <p>Used whenever you swipe long or short.</p>
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
          className={activeTab === "watchlist" ? "is-active" : ""}
          type="button"
          onClick={() => setActiveTab("watchlist")}
        >
          <Bookmark /><span>Watchlist</span>
          {watchlist.length > 0 && <b>{watchlist.length}</b>}
        </button>
        <button
          className={activeTab === "portfolio" ? "is-active" : ""}
          type="button"
          onClick={() => setActiveTab("portfolio")}
        >
          <Zap /><span>Activity</span>
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
                  <small>MARKET ORDER · TESTNET</small>
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
                sign one native Injective market order.
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
              Testnet only · no real funds · wallet approval required
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
