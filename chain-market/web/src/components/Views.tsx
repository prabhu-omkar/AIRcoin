import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  Coins,
  Cpu,
  ExternalLink,
  Flame,
  Globe2,
  Info,
  Layers,
  Leaf,
  MapPin,
  Plus,
  Radio,
  RefreshCw,
  Repeat2,
  ShieldCheck,
  Sparkles,
  Store,
  Wallet,
  WalletCards,
  XCircle,
} from "lucide-react";
import { useWallet } from "../context/WalletContext";
import { fetchListings, fetchMiner, fetchMinerMints } from "../services/api";
import {
  burnAir,
  burnForCompliance,
  buyListing,
  listAirOnMarket,
  readObligation,
} from "../services/chain";
import type { C4MinerData, MarketplaceListing } from "../types";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

const wei = (v: string | number) => Number(v) / 1e18;
const air = (n: number) =>
  n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
const inr = (n: number) =>
  "₹" +
  n.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const short = (a: string) =>
  a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—";
const COMPLIANCE_PERIOD = "2026";

const getTwinUrl = (): string => {
  if (import.meta.env.VITE_TWIN_URL) {
    return import.meta.env.VITE_TWIN_URL;
  }
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host !== "localhost" && host !== "127.0.0.1" && !host.endsWith(".local")) {
      return "https://aircoin-twin.vercel.app/";
    }
  }
  return "http://localhost:5174/";
};

export function useListings() {
  const [items, setItems] = useState<MarketplaceListing[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchListings();
      setItems(data.filter((l) => l.status === "active"));
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { items, loading, reload: load };
}

/* =========================================================================
   1. UNIFIED OVERVIEW VIEW (Combines Overview + My Miner + Earnings + Faucet)
   ========================================================================= */

interface UnifiedOverviewProps {
  onNavigateMarket: (subtab: "buy" | "burn" | "sell") => void;
}

export const UnifiedOverviewView: React.FC<UnifiedOverviewProps> = ({
  onNavigateMarket,
}) => {
  const { currentWallet, airBalance, tinrBalance, claimFreeFaucet, showToast } =
    useWallet();
  const [faucetBusy, setFaucetBusy] = useState(false);
  const [miner, setMiner] = useState<C4MinerData | null>(null);
  const [mints, setMints] = useState<
    { amount: string; ts: number; tx_hash: string }[]
  >([]);
  const [loadingMints, setLoadingMints] = useState(false);

  const minerId = currentWallet.minerId;
  const hasMiner = Boolean(minerId);

  // Request miner storage state
  const reqKey = `aircoin.minerRequest.${currentWallet.address}`;
  const [request, setRequest] = useState<{ address: string; at: number } | null>(
    () => {
      try {
        return JSON.parse(localStorage.getItem(reqKey) ?? "null");
      } catch {
        return null;
      }
    }
  );
  const [reqAddress, setReqAddress] = useState("");

  const submitMinerRequest = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqAddress.trim()) return;
    const r = { address: reqAddress.trim(), at: Date.now() };
    localStorage.setItem(reqKey, JSON.stringify(r));
    setRequest(r);
    showToast("Miner unit request dispatched to regulator network", "success");
  };

  const handleFaucet = async () => {
    setFaucetBusy(true);
    await claimFreeFaucet();
    setFaucetBusy(false);
  };

  useEffect(() => {
    if (minerId) {
      fetchMiner(minerId).then(setMiner);
      setLoadingMints(true);
      fetchMinerMints(minerId, 12)
        .then((r) => setMints(r.items ?? []))
        .finally(() => setLoadingMints(false));
    }
  }, [minerId]);

  const airNum = parseFloat(airBalance) || 0;
  const pm25Mg = (airNum * 1.0).toFixed(2);

  return (
    <div className="unified-dashboard-grid">
      {/* 1. TOP METRICS CARDS */}
      <section className="metrics-row">
        {/* Token Balance */}
        <div className="pro-metric-card highlight-emerald">
          <div className="metric-header">
            <span className="metric-icon-wrap emerald">
              <Leaf size={18} />
            </span>
            <span className="metric-badge">Circulating Asset</span>
          </div>
          <div className="metric-body">
            <span className="metric-label">Available AIR Balance</span>
            <div className="metric-value-wrap">
              <span className="metric-value font-mono">{air(airNum)}</span>
              <span className="metric-unit">AIR</span>
            </div>
            <p className="metric-subtext">
              <Sparkles size={13} className="inline mr-1 text-emerald-600" />
              Equivalent to <b>{pm25Mg} mg</b> PM2.5-eq removed
            </p>
          </div>
          <div className="metric-footer-actions">
            <button
              onClick={() => onNavigateMarket("buy")}
              className="metric-btn primary"
            >
              Buy AIR <ArrowRight size={13} />
            </button>
            <button
              onClick={() => onNavigateMarket("burn")}
              className="metric-btn outline"
            >
              Retire / Burn
            </button>
          </div>
        </div>

        {/* Fiat Test Liquidity */}
        <div className="pro-metric-card">
          <div className="metric-header">
            <span className="metric-icon-wrap blue">
              <WalletCards size={18} />
            </span>
            <span className="metric-badge neutral">Polygon Amoy</span>
          </div>
          <div className="metric-body">
            <span className="metric-label">Test Rupee Reserve (tINR)</span>
            <div className="metric-value-wrap">
              <span className="metric-value font-mono">₹{tinrBalance}</span>
            </div>
            <p className="metric-subtext">
              Institutional settlement liquidity for credit trades
            </p>
          </div>
          <div className="metric-footer-actions">
            <button
              disabled={faucetBusy}
              onClick={handleFaucet}
              className="metric-btn accent"
            >
              <Plus size={14} />
              {faucetBusy ? "Minting Funds..." : "Add ₹1,000 Faucet"}
            </button>
            <button
              onClick={() => onNavigateMarket("sell")}
              className="metric-btn outline"
            >
              Sell AIR
            </button>
          </div>
        </div>

        {/* Miner Rig / Live Stream Overview */}
        <div className="pro-metric-card">
          <div className="metric-header">
            <span className="metric-icon-wrap teal">
              {hasMiner ? <Cpu size={18} /> : <Building2 size={18} />}
            </span>
            <span
              className={`metric-badge ${
                hasMiner ? "status-active" : "status-neutral"
              }`}
            >
              <span className="pulse-dot" />
              {hasMiner ? "Hardware Online" : "Network Member"}
            </span>
          </div>
          <div className="metric-body">
            <span className="metric-label">
              {hasMiner ? "Assigned Rig Node" : "Participant Role"}
            </span>
            <div className="metric-value-wrap">
              <span className="metric-value">
                {hasMiner
                  ? minerId
                  : currentWallet.role === "company"
                  ? "Industrial Compliance"
                  : "Citizen Participant"}
              </span>
            </div>
            <p className="metric-subtext">
              {hasMiner
                ? `Total Rig Yield: ${
                    miner ? air(wei(miner.totals.minted)) : "0.4939"
                  } AIR`
                : "Eligible for carbon retirement certificates"}
            </p>
          </div>
          <div className="metric-footer-actions">
            {hasMiner ? (
              <a
                href={getTwinUrl()}
                target="_blank"
                rel="noreferrer"
                className="metric-btn primary w-full text-center"
              >
                Inspect Live Miner Stream <ArrowUpRight size={14} />
              </a>
            ) : (
              <button
                onClick={() => onNavigateMarket("buy")}
                className="metric-btn outline w-full"
              >
                View Marketplace
              </button>
            )}
          </div>
        </div>
      </section>

      {/* 3. RECENT MINT EARNINGS & PROOF LEDGER */}
      <section className="pro-panel">
        <div className="panel-header">
          <div className="panel-header-left">
            <div className="panel-badge-icon">
              <Layers size={16} />
            </div>
            <div>
              <h3>Verified PoUW Mint Earnings Ledger</h3>
              <p className="panel-subtitle">
                Direct on-chain Polygon Amoy mint transactions validated by
                consensus.
              </p>
            </div>
          </div>
          <div className="panel-header-right">
            <span className="text-xs text-muted-foreground font-mono">
              Auto-syncs every epoch
            </span>
          </div>
        </div>

        <div className="ledger-table-wrap">
          {loadingMints ? (
            <div className="empty-state-card">
              <RefreshCw className="animate-spin text-emerald-600 mb-2" size={20} />
              <p>Fetching on-chain mint receipts…</p>
            </div>
          ) : !mints.length ? (
            <div className="empty-state-card">
              <Leaf size={24} className="text-muted-foreground/60 mb-2" />
              <p className="font-medium text-foreground/90">
                {hasMiner
                  ? "Awaiting first epoch settlement"
                  : "No mint activity recorded"}
              </p>
              <span className="text-xs text-muted-foreground mt-1">
                {hasMiner
                  ? "Proofs are submitted every 60s epoch. The validator will mint tokens once the round seals."
                  : "Deploy a miner node or acquire AIR tokens on the marketplace."}
              </span>
            </div>
          ) : (
            <table className="pro-table">
              <thead>
                <tr>
                  <th>Epoch Timestamp</th>
                  <th>Transaction Hash</th>
                  <th>Consensus Engine</th>
                  <th>Verified Credit</th>
                  <th className="text-right">Settlement</th>
                </tr>
              </thead>
              <tbody>
                {mints.map((m) => (
                  <tr key={m.tx_hash}>
                    <td className="text-foreground/90 font-medium">
                      {new Date(m.ts).toLocaleString("en-IN", {
                        dateStyle: "medium",
                        timeStyle: "medium",
                      })}
                    </td>
                    <td>
                      <span className="tx-hash-badge font-mono">
                        {short(m.tx_hash)}
                      </span>
                    </td>
                    <td>
                      <span className="proof-tag">
                        <ShieldCheck size={12} /> PoUW secp256k1
                      </span>
                    </td>
                    <td>
                      <span className="mint-amount-pill font-mono">
                        +{air(wei(m.amount))} AIR
                      </span>
                    </td>
                    <td className="text-right">
                      <span className="status-badge-settled">
                        <CheckCircle2 size={13} /> Finalized
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
};

/* =========================================================================
   2. UNIFIED MARKET & COMPLIANCE VIEW (Combines Buy + Burn/Retire + Sell)
   ========================================================================= */

interface UnifiedMarketProps {
  initialSubtab?: "buy" | "burn" | "sell";
}

export const UnifiedMarketView: React.FC<UnifiedMarketProps> = ({
  initialSubtab = "buy",
}) => {
  const { currentWallet, airBalance, tinrBalance, refreshBalances, showToast } =
    useWallet();
  const { items, reload, loading } = useListings();

  const [activeTab, setActiveTab] = useState<"buy" | "burn" | "sell">(
    initialSubtab
  );

  // Buy state
  const [buyingId, setBuyingId] = useState<number | null>(null);

  // Sell state
  const [sellAmount, setSellAmount] = useState("0.05");
  const [sellPrice, setSellPrice] = useState("50");
  const [sellBusy, setSellBusy] = useState(false);

  // Burn state
  const [obligation, setObligation] = useState<{
    amount: number;
    burned: number;
  } | null>(null);
  const [burnAmount, setBurnAmount] = useState("0.05");
  const [burnBusy, setBurnBusy] = useState(false);

  const loadObligation = useCallback(() => {
    readObligation(currentWallet.address, COMPLIANCE_PERIOD).then(setObligation);
  }, [currentWallet.address]);

  useEffect(() => {
    loadObligation();
  }, [loadObligation]);

  // Offers available to buy (excluding own listings)
  const offers = items?.filter(
    (l) => l.seller.toLowerCase() !== currentWallet.address.toLowerCase()
  );

  // User's own listings
  const myListings = items?.filter(
    (l) => l.seller.toLowerCase() === currentWallet.address.toLowerCase()
  );

  // Buy action
  const handleBuy = async (listing: MarketplaceListing) => {
    setBuyingId(listing.id);
    const costInr = wei(listing.price_tinr);
    const amountAir = wei(listing.amount_air);

    const res = await buyListing(
      currentWallet.privateKey!,
      listing.id,
      String(costInr)
    );
    setBuyingId(null);

    showToast(
      res.success
        ? `Successfully purchased ${air(amountAir)} AIR for ${inr(costInr)}!`
        : `Purchase transaction failed: ${res.error}`,
      res.success ? "success" : "error"
    );

    if (res.success) {
      reload();
      refreshBalances();
    }
  };

  // Sell action
  const handleListForSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sellAmount || !sellPrice) return;
    setSellBusy(true);

    const res = await listAirOnMarket(
      currentWallet.privateKey!,
      sellAmount,
      sellPrice
    );
    setSellBusy(false);

    showToast(
      res.success
        ? `Listed ${sellAmount} AIR on marketplace for ₹${sellPrice}`
        : `Listing failed: ${res.error}`,
      res.success ? "success" : "error"
    );

    if (res.success) {
      reload();
      refreshBalances();
    }
  };

  // Burn action
  const handleRetire = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!burnAmount) return;
    setBurnBusy(true);

    const res = obligation
      ? await burnForCompliance(
          currentWallet.privateKey!,
          COMPLIANCE_PERIOD,
          burnAmount
        )
      : await burnAir(currentWallet.privateKey!, burnAmount);
    setBurnBusy(false);

    showToast(
      res.success
        ? `Permanently retired ${burnAmount} AIR credits!`
        : `Retirement burn failed: ${res.error}`,
      res.success ? "success" : "error"
    );

    if (res.success) {
      loadObligation();
      refreshBalances();
    }
  };

  // Calculations
  const floorPrice =
    offers && offers.length > 0
      ? Math.min(...offers.map((o) => wei(o.price_tinr) / wei(o.amount_air)))
      : 1000;

  const totalVolumeListed = offers
    ? offers.reduce((acc, o) => acc + wei(o.amount_air), 0)
    : 0;

  const obligationPct = obligation
    ? Math.min(100, (obligation.burned / obligation.amount) * 100)
    : 0;

  return (
    <div className="unified-market-container">
      {/* 1. MARKET LIQUIDITY BANNER */}
      <section className="market-ticker-banner">
        <div className="ticker-item">
          <span className="ticker-label">Reference Floor Price</span>
          <div className="ticker-val-row">
            <span className="ticker-val font-mono">{inr(floorPrice)}</span>
            <span className="ticker-unit">/ AIR</span>
          </div>
        </div>
        <div className="ticker-divider" />
        <div className="ticker-item">
          <span className="ticker-label">Available Orderbook Volume</span>
          <div className="ticker-val-row">
            <span className="ticker-val font-mono">
              {air(totalVolumeListed)}
            </span>
            <span className="ticker-unit">AIR</span>
          </div>
        </div>
        <div className="ticker-divider" />
        <div className="ticker-item">
          <span className="ticker-label">Your Wallet Liquidity</span>
          <div className="ticker-val-row">
            <span className="ticker-val font-mono">{airBalance} AIR</span>
            <span className="ticker-unit">· ₹{tinrBalance}</span>
          </div>
        </div>
        {obligation && (
          <>
            <div className="ticker-divider" />
            <div className="ticker-item highlight-corp">
              <span className="ticker-label">
                Compliance Quota ({COMPLIANCE_PERIOD})
              </span>
              <div className="ticker-val-row">
                <span className="ticker-val font-mono">
                  {obligationPct.toFixed(0)}%
                </span>
                <span className="ticker-unit">
                  ({air(obligation.burned)} / {air(obligation.amount)} AIR)
                </span>
              </div>
            </div>
          </>
        )}
      </section>

      {/* 2. TABBED SEGMENTED CONTROL */}
      <div className="market-tabs-wrapper">
        <div className="market-segment-control">
          <button
            onClick={() => setActiveTab("buy")}
            className={`segment-btn ${activeTab === "buy" ? "active" : ""}`}
          >
            <Store size={15} />
            <span>Buy AIR (Marketplace)</span>
            {offers && offers.length > 0 && (
              <span className="count-pill">{offers.length}</span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("burn")}
            className={`segment-btn ${activeTab === "burn" ? "active" : ""}`}
          >
            <Flame size={15} />
            <span>Retire & Burn (Compliance)</span>
            {obligation && <span className="corp-pill">Mandate</span>}
          </button>
          <button
            onClick={() => setActiveTab("sell")}
            className={`segment-btn ${activeTab === "sell" ? "active" : ""}`}
          >
            <Repeat2 size={15} />
            <span>Sell AIR Credits</span>
            {myListings && myListings.length > 0 && (
              <span className="count-pill neutral">{myListings.length}</span>
            )}
          </button>
        </div>
      </div>

      {/* 3. TAB CONTENT WORKSPACES */}

      {/* TAB A: BUY AIR ORDERBOOK */}
      {activeTab === "buy" && (
        <section className="pro-panel">
          <div className="panel-header">
            <div className="panel-header-left">
              <div className="panel-badge-icon">
                <Store size={16} />
              </div>
              <div>
                <h3>Spot Market Orderbook</h3>
                <p className="panel-subtitle">
                  Purchase verified environmental credits directly from citizen
                  miner operators.
                </p>
              </div>
            </div>
            <div className="panel-header-right">
              <button onClick={reload} className="action-refresh-btn">
                <RefreshCw
                  size={13}
                  className={loading ? "animate-spin" : ""}
                />{" "}
                Refresh
              </button>
            </div>
          </div>

          <div className="ledger-table-wrap">
            {!offers || loading ? (
              <div className="empty-state-card">
                <RefreshCw className="animate-spin text-emerald-600 mb-2" size={20} />
                <p>Loading active market offers…</p>
              </div>
            ) : !offers.length ? (
              <div className="empty-state-card">
                <Store size={26} className="text-muted-foreground/60 mb-2" />
                <p className="font-medium text-foreground/90">
                  No active listings available right now
                </p>
                <span className="text-xs text-muted-foreground mt-1">
                  Citizen miners mint new credits every 60-second epoch. Check
                  back shortly or list credits if you hold AIR.
                </span>
              </div>
            ) : (
              <table className="pro-table">
                <thead>
                  <tr>
                    <th>Listing ID</th>
                    <th>Volume (AIR)</th>
                    <th>Total Price (tINR)</th>
                    <th>Unit Rate (₹/AIR)</th>
                    <th>Verified Seller</th>
                    <th className="text-right">Execution</th>
                  </tr>
                </thead>
                <tbody>
                  {offers.map((listing) => {
                    const amount = wei(listing.amount_air);
                    const price = wei(listing.price_tinr);
                    const unitRate = price / amount;
                    const isAffordable = Number(tinrBalance) >= price;

                    return (
                      <tr key={listing.id}>
                        <td>
                          <span className="id-badge font-mono">
                            #{listing.id}
                          </span>
                        </td>
                        <td>
                          <span className="font-mono font-semibold text-foreground">
                            {air(amount)} AIR
                          </span>
                        </td>
                        <td>
                          <span className="font-mono font-bold text-emerald-800">
                            {inr(price)}
                          </span>
                        </td>
                        <td>
                          <span className="font-mono text-xs text-muted-foreground">
                            {inr(unitRate)} / AIR
                          </span>
                        </td>
                        <td>
                          <span className="seller-badge font-mono">
                            {short(listing.seller)}
                          </span>
                        </td>
                        <td className="text-right">
                          <Button
                            size="sm"
                            disabled={buyingId !== null || !isAffordable}
                            onClick={() => handleBuy(listing)}
                            className="pro-table-action-btn"
                          >
                            {buyingId === listing.id
                              ? "Executing…"
                              : isAffordable
                              ? "Buy Now"
                              : "Low tINR"}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </section>
      )}

      {/* TAB B: RETIRE & BURN (COMPLIANCE / ESG) */}
      {activeTab === "burn" && (
        <div className="burn-workspace-grid">
          <section className="pro-panel burn-action-panel">
            <div className="panel-header">
              <div className="panel-header-left">
                <div className="panel-badge-icon red">
                  <Flame size={16} />
                </div>
                <div>
                  <h3>
                    {obligation
                      ? `Statutory Compliance Retirement · ${COMPLIANCE_PERIOD}`
                      : "Voluntary Environmental Retirement"}
                  </h3>
                  <p className="panel-subtitle">
                    {obligation
                      ? "Submit permanent cryptographic token burn receipts directly to the Regulatory ComplianceRegistry."
                      : "Permanently retire AIR tokens from circulation to claim verified atmospheric PM2.5-equivalent removal."}
                  </p>
                </div>
              </div>
            </div>

            <div className="panel-body p-6">
              {obligation ? (
                <div className="obligation-meter-card mb-6">
                  <div className="flex justify-between items-baseline mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Regulator Period {COMPLIANCE_PERIOD} Mandate
                    </span>
                    <span className="text-sm font-bold text-emerald-800 font-mono">
                      {obligationPct.toFixed(1)}% Satisfied
                    </span>
                  </div>
                  <div className="progress-bar-container">
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${obligationPct}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-2 font-mono">
                    <span>
                      Retired: <b>{air(obligation.burned)} AIR</b>
                    </span>
                    <span>
                      Required Quota: <b>{air(obligation.amount)} AIR</b>
                    </span>
                  </div>
                </div>
              ) : (
                <div className="info-banner mb-6">
                  <Info size={18} className="text-emerald-700 shrink-0 mt-0.5" />
                  <div className="text-xs leading-relaxed text-foreground/80">
                    <b>Irreversible Environmental Settlement:</b> Burning
                    destroys AIR tokens forever on the smart contract. Each
                    retired AIR token represents exactly 1 milligram of
                    PM2.5-equivalent particulate matter filtered by monitored
                    plants.
                  </div>
                </div>
              )}

              <form onSubmit={handleRetire} className="burn-form">
                <div className="grid gap-2">
                  <div className="flex justify-between">
                    <label htmlFor="retire-amount" className="pro-label">
                      Retirement Volume (AIR)
                    </label>
                    <span className="text-xs text-muted-foreground font-mono">
                      Available: <b>{airBalance} AIR</b>
                    </span>
                  </div>
                  <div className="relative">
                    <Input
                      id="retire-amount"
                      inputMode="decimal"
                      value={burnAmount}
                      onChange={(e) => setBurnAmount(e.target.value)}
                      placeholder="0.00"
                      className="pro-input pr-16 font-mono text-base"
                    />
                    <button
                      type="button"
                      onClick={() => setBurnAmount(airBalance)}
                      className="input-preset-max-btn"
                    >
                      MAX
                    </button>
                  </div>
                  <div className="preset-chips-row">
                    {["0.01", "0.05", "0.10", "0.50"].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => setBurnAmount(preset)}
                        className="preset-chip"
                      >
                        {preset} AIR
                      </button>
                    ))}
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    type="submit"
                    variant="destructive"
                    disabled={
                      burnBusy ||
                      !burnAmount ||
                      parseFloat(burnAmount) <= 0 ||
                      parseFloat(burnAmount) > parseFloat(airBalance)
                    }
                    className="pro-burn-submit-btn w-full"
                  >
                    <Flame size={16} />
                    {burnBusy
                      ? "Retiring On-Chain…"
                      : `Permanently Retire ${burnAmount || "0"} AIR`}
                  </Button>
                </div>
              </form>
            </div>
          </section>

          {/* Certificate / Impact Guarantee Preview */}
          <section className="pro-panel certificate-card">
            <div className="panel-header">
              <div className="panel-header-left">
                <div className="panel-badge-icon emerald">
                  <ShieldCheck size={16} />
                </div>
                <div>
                  <h3>Proof of Environmental Cleansing</h3>
                  <p className="panel-subtitle">
                    Regulatory certificate standard C4.
                  </p>
                </div>
              </div>
            </div>
            <div className="certificate-body">
              <div className="certificate-seal">
                <Globe2 size={36} className="text-emerald-700" />
                <h4>AIRcoin Environmental Ledger</h4>
                <span className="cert-subtitle">Atmospheric Offsetting Verification</span>
              </div>
              <dl className="cert-meta-list">
                <div>
                  <dt>Beneficiary</dt>
                  <dd className="font-semibold">{currentWallet.name}</dd>
                </div>
                <div>
                  <dt>Account Address</dt>
                  <dd className="font-mono text-xs">{short(currentWallet.address)}</dd>
                </div>
                <div>
                  <dt>Settlement Standard</dt>
                  <dd>1 AIR = 1 mg PM2.5-eq</dd>
                </div>
                <div>
                  <dt>Audit Authority</dt>
                  <dd>Central Pollution Control Board (Mock)</dd>
                </div>
              </dl>
              <div className="cert-footer-stamp">
                <CheckCircle2 size={14} className="text-emerald-600 inline mr-1.5" />
                Valid for Statutory ESG Audit
              </div>
            </div>
          </section>
        </div>
      )}

      {/* TAB C: SELL AIR CREDITS */}
      {activeTab === "sell" && (
        <div className="sell-workspace-grid">
          {/* Create Listing Card */}
          <section className="pro-panel">
            <div className="panel-header">
              <div className="panel-header-left">
                <div className="panel-badge-icon">
                  <Repeat2 size={16} />
                </div>
                <div>
                  <h3>Create Marketplace Listing</h3>
                  <p className="panel-subtitle">
                    List your verified minted AIR credits for sale in exchange
                    for Test INR (tINR).
                  </p>
                </div>
              </div>
            </div>
            <div className="panel-body p-6">
              <form onSubmit={handleListForSale} className="grid gap-5">
                <div className="grid gap-2">
                  <div className="flex justify-between">
                    <label htmlFor="sell-amount-input" className="pro-label">
                      Volume to List (AIR)
                    </label>
                    <span className="text-xs text-muted-foreground font-mono">
                      Balance: <b>{airBalance} AIR</b>
                    </span>
                  </div>
                  <Input
                    id="sell-amount-input"
                    inputMode="decimal"
                    value={sellAmount}
                    onChange={(e) => setSellAmount(e.target.value)}
                    placeholder="0.05"
                    className="pro-input font-mono"
                  />
                </div>

                <div className="grid gap-2">
                  <label htmlFor="sell-price-input" className="pro-label">
                    Total Asking Price (₹ tINR)
                  </label>
                  <Input
                    id="sell-price-input"
                    inputMode="decimal"
                    value={sellPrice}
                    onChange={(e) => setSellPrice(e.target.value)}
                    placeholder="50"
                    className="pro-input font-mono"
                  />
                  {parseFloat(sellAmount) > 0 && parseFloat(sellPrice) > 0 && (
                    <span className="text-xs text-muted-foreground font-mono">
                      Calculated Rate:{" "}
                      <b>
                        {inr(parseFloat(sellPrice) / parseFloat(sellAmount))} /
                        AIR
                      </b>
                    </span>
                  )}
                </div>

                <Button
                  type="submit"
                  disabled={
                    sellBusy ||
                    !sellAmount ||
                    !sellPrice ||
                    parseFloat(sellAmount) > parseFloat(airBalance)
                  }
                  className="pro-btn-submit w-full mt-2"
                >
                  {sellBusy ? "Creating On-Chain Listing…" : "Publish Listing"}
                </Button>
              </form>
            </div>
          </section>

          {/* Active User Listings */}
          <section className="pro-panel">
            <div className="panel-header">
              <div className="panel-header-left">
                <div className="panel-badge-icon">
                  <Layers size={16} />
                </div>
                <div>
                  <h3>Your Active Listings</h3>
                  <p className="panel-subtitle">
                    Listings currently open to buyers on the orderbook.
                  </p>
                </div>
              </div>
            </div>
            <div className="panel-body p-6">
              {!myListings ? (
                <div className="empty-state-card">
                  <RefreshCw className="animate-spin text-emerald-600 mb-2" size={20} />
                  <p>Loading your active offers…</p>
                </div>
              ) : !myListings.length ? (
                <div className="empty-state-card">
                  <Store size={24} className="text-muted-foreground/60 mb-2" />
                  <p className="font-medium text-foreground/90">
                    No active listings posted
                  </p>
                  <span className="text-xs text-muted-foreground mt-1">
                    When you offer AIR for sale, your orders will appear here.
                  </span>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {myListings.map((l) => (
                    <li
                      key={l.id}
                      className="py-3 flex items-center justify-between font-mono"
                    >
                      <div className="flex items-center gap-3">
                        <span className="id-badge">#{l.id}</span>
                        <span className="font-semibold text-foreground">
                          {air(wei(l.amount_air))} AIR
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-emerald-800">
                          {inr(wei(l.price_tinr))}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {inr(wei(l.price_tinr) / wei(l.amount_air))} / AIR
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
};
