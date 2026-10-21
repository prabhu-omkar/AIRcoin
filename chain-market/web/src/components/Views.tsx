import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Building2, Check, Flame, Plus, RefreshCw, ShieldCheck, Sprout, Store } from "lucide-react";
import { useWallet, creditWalletBalance } from "../context/WalletContext";
import { fetchListings, fetchMiner, fetchMinerMints } from "../services/api";
import { burnAir, burnForCompliance, buyListing, listAirOnMarket, readObligation, recordComplianceBurn } from "../services/chain";
import { ethers } from "ethers";
import type { C4MinerData, MarketplaceListing } from "../types";

const wei = (v: string | number) => Number(v) / 1e18;
const air = (n: number, d = 4) => n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: d });
const inr = (n: number) => "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "–");
const COMPLIANCE_PERIOD = "2026";
const EXPLORER = "https://amoy.polygonscan.com/tx/";

const getTwinUrl = (): string => {
  if (import.meta.env.VITE_TWIN_URL) return import.meta.env.VITE_TWIN_URL;
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host !== "localhost" && host !== "127.0.0.1" && !host.endsWith(".local")) return "https://aircoin-twin.vercel.app/";
  }
  return "http://localhost:5174/";
};

/** Demo order book shown until the indexer returns real listings. */
export const SEED_MARKET_LISTINGS: MarketplaceListing[] = [
  { id: 1, seller: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", amount_air: "250000000000000000", price_tinr: "250000000000000000000", status: "active", created_at: 1776000000 },
  { id: 2, seller: "0x90F79bf6EB2c4f870365E785982E1f101E93b906", amount_air: "500000000000000000", price_tinr: "480000000000000000000", status: "active", created_at: 1776000300 },
  { id: 3, seller: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65", amount_air: "1000000000000000000", price_tinr: "950000000000000000000", status: "active", created_at: 1776000600 },
  { id: 4, seller: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4df", amount_air: "150000000000000000", price_tinr: "160000000000000000000", status: "active", created_at: 1776000900 },
];

const SELLER_NAMES: Record<string, string> = {
  "0x70997970c51812dc3a010c7d01b50e0d17dc79c8": "Alice, miner-001",
  "0x90f79bf6eb2c4f870365e785982e1f101e93b906": "Rohan, miner-002",
  "0x15d34aaf54267db7d7c367839aaf71a00a2c6a65": "Connaught Place cluster",
  "0x9965507d1a55bcc2695c58ba16fb37d819b0a4df": "Anand Vihar rooftop",
};
const sellerName = (a: string) => SELLER_NAMES[a.toLowerCase()];

export function getStoredListings(): MarketplaceListing[] {
  try {
    const raw = localStorage.getItem("aircoin.marketplace.listings");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {}
  try {
    localStorage.setItem("aircoin.marketplace.listings", JSON.stringify(SEED_MARKET_LISTINGS));
  } catch {}
  return SEED_MARKET_LISTINGS;
}

export function saveStoredListings(listings: MarketplaceListing[]) {
  try {
    localStorage.setItem("aircoin.marketplace.listings", JSON.stringify(listings));
  } catch {}
}

export function useListings() {
  const [items, setItems] = useState<MarketplaceListing[] | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const local = getStoredListings();
      let remote: MarketplaceListing[] = [];
      try {
        remote = await fetchListings();
      } catch {}
      const map = new Map<number, MarketplaceListing>();
      local.forEach((l) => map.set(l.id, l));
      remote.forEach((r) => map.set(r.id, r));
      const merged = Array.from(map.values());
      saveStoredListings(merged);
      setItems(merged.filter((l) => l.status === "active"));
    } catch {
      setItems(getStoredListings().filter((l) => l.status === "active"));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);
  return { items, loading, reload: load };
}

/** Tells the user honestly whether a transaction reached the chain or was only recorded in this browser. */
function txNote(simulated?: boolean) {
  return simulated ? " The testnet couldn't be reached, so this was recorded in this browser only." : "";
}

function Panel({ title, lead, tools, className = "", children }: { title: string; lead?: string; tools?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <section className={`panel ${className}`}>
      <header className="panel-head">
        <div>
          <h2>{title}</h2>
          {lead && <p>{lead}</p>}
        </div>
        {tools && <div className="panel-tools">{tools}</div>}
      </header>
      <div className="panel-body">{children}</div>
    </section>
  );
}

/* =========================================================================
   Overview
   ========================================================================= */

interface UnifiedOverviewProps {
  onNavigateMarket: (subtab: "buy" | "burn" | "sell") => void;
}

export const UnifiedOverviewView: React.FC<UnifiedOverviewProps> = ({ onNavigateMarket }) => {
  const { currentWallet, airBalance, tinrBalance, claimFreeFaucet } = useWallet();
  const [faucetBusy, setFaucetBusy] = useState(false);
  const [miner, setMiner] = useState<C4MinerData | null>(null);
  const [mints, setMints] = useState<{ amount: string; ts: number; tx_hash: string; epoch?: number }[]>([]);
  const [loadingMints, setLoadingMints] = useState(false);
  const [obligation, setObligation] = useState<{ amount: number; burned: number } | null>(null);

  const minerId = currentWallet.minerId;
  const isCompany = currentWallet.role === "company";
  const airNum = parseFloat(airBalance) || 0;

  useEffect(() => {
    if (minerId) {
      fetchMiner(minerId).then(setMiner);
      setLoadingMints(true);
      fetchMinerMints(minerId, 12)
        .then((r) => setMints(r.items ?? []))
        .finally(() => setLoadingMints(false));
    }
    if (isCompany) readObligation(currentWallet.address, COMPLIANCE_PERIOD).then(setObligation);
  }, [minerId, isCompany, currentWallet.address]);

  const handleFaucet = async () => {
    setFaucetBusy(true);
    await claimFreeFaucet();
    setFaucetBusy(false);
  };

  const pct = obligation ? Math.min(100, (obligation.burned / obligation.amount) * 100) : 0;

  return (
    <div className="overview">
      <section className="hero">
        {isCompany && obligation ? (
          <div className="hero-main">
            <p className="hero-kicker">Compliance obligation for {COMPLIANCE_PERIOD}</p>
            <div className="hero-figure">
              <b className="num">{air(obligation.burned, 2)}</b>
              <span>of {air(obligation.amount, 2)} AIR retired</span>
            </div>
            <div className="obligation">
              <div className="obligation-track"><i style={{ width: `${pct}%` }} /></div>
              <div className="obligation-meta">
                <span>{pct.toFixed(0)}% met</span>
                <span>{air(Math.max(0, obligation.amount - obligation.burned), 2)} AIR still to retire</span>
              </div>
            </div>
            <div className="hero-actions">
              <button className="btn ink" onClick={() => onNavigateMarket("buy")}><Store size={16} />Buy AIR</button>
              <button className="btn" onClick={() => onNavigateMarket("burn")}><Flame size={16} />Retire AIR</button>
            </div>
          </div>
        ) : (
          <div className="hero-main">
            <p className="hero-kicker">{minerId ? `Earned by ${minerId}` : "Your AIR"}</p>
            <div className="hero-figure">
              <b className="num">{air(airNum)}</b>
              <span>AIR</span>
            </div>
            <p className="hero-equiv">
              Each AIR is 1 mg of PM2.5-equivalent pollution removed by plants and verified by a miner's camera. This balance stands for <b>{air(airNum, 2)} mg</b>.
            </p>
            <div className="hero-actions">
              {minerId ? (
                <>
                  <button className="btn ink" onClick={() => onNavigateMarket("sell")}><Store size={16} />Sell AIR</button>
                  <a className="btn" href={getTwinUrl()} target="_blank" rel="noreferrer">Watch the miner live<ArrowUpRight size={16} /></a>
                </>
              ) : (
                <>
                  <button className="btn ink" onClick={() => onNavigateMarket("buy")}><Store size={16} />Buy AIR</button>
                  <button className="btn" onClick={() => onNavigateMarket("burn")}><Flame size={16} />Retire AIR</button>
                </>
              )}
            </div>
          </div>
        )}

        <aside className="hero-side">
          <div className="ledger-line">
            <span>AIR</span>
            <b className="num">{air(airNum)}</b>
          </div>
          <div className="ledger-line">
            <span>Test rupees (tINR)</span>
            <b className="num">{inr(parseFloat(tinrBalance) || 0)}</b>
          </div>
          <button className="btn block" disabled={faucetBusy} onClick={handleFaucet}>
            <Plus size={15} />
            {faucetBusy ? "Adding test rupees" : "Add ₹10,000 test rupees"}
          </button>
          <p className="fine">tINR is a test stablecoin on Polygon Amoy. It has no real value.</p>
        </aside>
      </section>

      {minerId && (
        <section className="miner-strip">
          <div className="miner-id">
            <span className="pulse" />
            <div>
              <b>{minerId}</b>
              <span>{miner ? `Status: ${miner.status}` : "Registered miner"}</span>
            </div>
          </div>
          <dl>
            <div><dt>Minted to date</dt><dd className="num">{miner ? air(wei(miner.totals.minted)) : "–"} AIR</dd></div>
            <div><dt>Proofs accepted</dt><dd className="num">{miner ? miner.totals.epochs_minted : "–"}</dd></div>
            <div><dt>Proofs rejected</dt><dd className="num">{miner ? miner.totals.epochs_rejected : "–"}</dd></div>
            <div><dt>Stickers registered</dt><dd className="num">{miner ? miner.sticker_ids.length : 20}</dd></div>
          </dl>
        </section>
      )}

      <Panel
        title={minerId ? "Minted by your miner" : isCompany ? "How retiring AIR works" : "Where AIR comes from"}
        lead={minerId ? "Every row is one 60-second proof the validator checked and minted on Polygon Amoy." : undefined}
      >
        {minerId ? (
          loadingMints ? (
            <div className="empty"><RefreshCw size={16} className="spin" />Fetching mint receipts</div>
          ) : !mints.length ? (
            <div className="empty">
              <b>No mints indexed yet</b>
              <span>The miner signs a proof every minute. Mints appear here once the indexer has seen them on-chain.</span>
            </div>
          ) : (
            <table className="table">
              <thead><tr><th>Time</th><th>Transaction</th><th>Proof</th><th className="r">Minted</th></tr></thead>
              <tbody>
                {mints.map((m) => (
                  <tr key={m.tx_hash}>
                    <td>{new Date(m.ts).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "medium" })}</td>
                    <td><a className="hash" href={EXPLORER + m.tx_hash} target="_blank" rel="noreferrer">{short(m.tx_hash)}</a></td>
                    <td><span className="tag ok"><ShieldCheck size={13} />Signed by device</span></td>
                    <td className="r num pos">+{air(wei(m.amount), 5)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : (
          <ol className="steps">
            <li><b>A camera watches 20 plants</b><span>The miner checks each pot for living leaves and estimates the pollution removed.</span></li>
            <li><b>It signs a proof every minute</b><span>The validator checks the device signature, location and caps before minting.</span></li>
            <li><b>{isCompany ? "You buy and retire it" : "Owners sell it here"}</b><span>{isCompany ? "Retiring burns AIR for good and records it against your obligation." : "Companies buy AIR and retire it to meet their pollution obligations."}</span></li>
          </ol>
        )}
      </Panel>
    </div>
  );
};

/* =========================================================================
   Market: buy, sell, retire
   ========================================================================= */

interface UnifiedMarketProps {
  initialSubtab?: "buy" | "burn" | "sell";
}

interface Certificate {
  amount: string;
  txHash?: string;
  simulated?: boolean;
  at: number;
}

export const UnifiedMarketView: React.FC<UnifiedMarketProps> = ({ initialSubtab = "buy" }) => {
  const { currentWallet, airBalance, tinrBalance, refreshBalances, showToast, adjustBalances } = useWallet();
  const { items, reload, loading } = useListings();
  const [activeTab, setActiveTab] = useState<"buy" | "burn" | "sell">(initialSubtab);
  useEffect(() => setActiveTab(initialSubtab), [initialSubtab]);

  const [buyingId, setBuyingId] = useState<number | null>(null);
  const [sellAmount, setSellAmount] = useState("0.05");
  const [sellPrice, setSellPrice] = useState("50");
  const [sellBusy, setSellBusy] = useState(false);
  const [obligation, setObligation] = useState<{ amount: number; burned: number } | null>(null);
  const [burnAmount, setBurnAmount] = useState("0.05");
  const [burnBusy, setBurnBusy] = useState(false);
  const [cert, setCert] = useState<Certificate | null>(null);

  const loadObligation = useCallback(() => {
    readObligation(currentWallet.address, COMPLIANCE_PERIOD).then(setObligation);
  }, [currentWallet.address]);
  useEffect(() => {
    loadObligation();
  }, [loadObligation]);

  const me = currentWallet.address.toLowerCase();
  const offers = useMemo(
    () => items?.filter((l) => l.seller.toLowerCase() !== me).sort((a, b) => wei(a.price_tinr) / wei(a.amount_air) - wei(b.price_tinr) / wei(b.amount_air)),
    [items, me],
  );
  const myListings = items?.filter((l) => l.seller.toLowerCase() === me);

  const handleBuy = async (listing: MarketplaceListing) => {
    setBuyingId(listing.id);
    const costInr = wei(listing.price_tinr);
    const amountAir = wei(listing.amount_air);
    const res = await buyListing(currentWallet.privateKey!, listing.id, String(costInr));
    setBuyingId(null);
    if (res.success) {
      saveStoredListings(getStoredListings().map((l) => (l.id === listing.id ? { ...l, status: "sold" as const } : l)));
      adjustBalances(amountAir, -costInr);
      creditWalletBalance(listing.seller, 0, costInr);
      showToast(`Bought ${air(amountAir)} AIR for ${inr(costInr)}.${txNote(res.simulated)}`, "success");
      reload();
      refreshBalances();
    } else {
      showToast(`Purchase failed: ${res.error}`, "error");
    }
  };

  const handleListForSale = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = parseFloat(sellAmount);
    const priceNum = parseFloat(sellPrice);
    if (!(amountNum > 0) || !(priceNum > 0)) return;
    if (amountNum > parseFloat(airBalance)) {
      showToast("You don't have that much AIR to list.", "error");
      return;
    }
    setSellBusy(true);
    const res = await listAirOnMarket(currentWallet.privateKey!, sellAmount, sellPrice);
    setSellBusy(false);
    if (res.success) {
      const all = getStoredListings();
      const nextId = all.reduce((max, l) => Math.max(max, l.id), 0) + 1;
      saveStoredListings([
        ...all,
        {
          id: nextId,
          seller: currentWallet.address,
          amount_air: ethers.parseEther(sellAmount).toString(),
          price_tinr: ethers.parseEther(sellPrice).toString(),
          status: "active",
          created_at: Math.floor(Date.now() / 1000),
          tx_hash: res.txHash,
        },
      ]);
      adjustBalances(-amountNum, 0);
      showToast(`Listed ${sellAmount} AIR for ₹${sellPrice}.${txNote(res.simulated)}`, "success");
      reload();
      refreshBalances();
    } else {
      showToast(`Listing failed: ${res.error}`, "error");
    }
  };

  const handleRetire = async (e: React.FormEvent) => {
    e.preventDefault();
    const burnNum = parseFloat(burnAmount);
    if (!(burnNum > 0) || burnNum > parseFloat(airBalance)) {
      showToast("Enter an amount up to your AIR balance.", "error");
      return;
    }
    setBurnBusy(true);
    const res = obligation
      ? await burnForCompliance(currentWallet.privateKey!, COMPLIANCE_PERIOD, burnAmount)
      : await burnAir(currentWallet.privateKey!, burnAmount);
    setBurnBusy(false);
    if (res.success) {
      adjustBalances(-burnNum, 0);
      if (obligation) await recordComplianceBurn(currentWallet.address, COMPLIANCE_PERIOD, burnNum);
      setCert({ amount: burnAmount, txHash: res.txHash, simulated: res.simulated, at: Date.now() });
      showToast(`Retired ${burnAmount} AIR for good.${txNote(res.simulated)}`, "success");
      loadObligation();
      refreshBalances();
    } else {
      showToast(`Retirement failed: ${res.error}`, "error");
    }
  };

  const unit = (l: MarketplaceListing) => wei(l.price_tinr) / wei(l.amount_air);
  const floorPrice = offers && offers.length ? Math.min(...offers.map(unit)) : 0;
  const volume = offers ? offers.reduce((acc, o) => acc + wei(o.amount_air), 0) : 0;
  const maxAmount = offers && offers.length ? Math.max(...offers.map((o) => wei(o.amount_air))) : 1;
  const pct = obligation ? Math.min(100, (obligation.burned / obligation.amount) * 100) : 0;
  const sellRate = parseFloat(sellPrice) / parseFloat(sellAmount);

  return (
    <div className="market">
      <section className="ticker">
        <div><span>Lowest price</span><b className="num">{floorPrice ? inr(floorPrice) : "–"}</b><small>per AIR</small></div>
        <div><span>AIR on offer</span><b className="num">{air(volume)}</b><small>in {offers?.length ?? 0} listings</small></div>
        <div><span>Your AIR</span><b className="num">{airBalance}</b></div>
        <div><span>Your tINR</span><b className="num">{inr(parseFloat(tinrBalance) || 0)}</b></div>
        {obligation && <div className="ticker-ob"><span>{COMPLIANCE_PERIOD} obligation</span><b className="num">{pct.toFixed(0)}%</b><small>met</small></div>}
      </section>

      <div className="tabs" role="tablist" aria-label="Market">
        <button role="tab" aria-selected={activeTab === "buy"} className={activeTab === "buy" ? "active" : ""} onClick={() => setActiveTab("buy")}>
          Buy{offers && offers.length > 0 && <span className="count">{offers.length}</span>}
        </button>
        <button role="tab" aria-selected={activeTab === "sell"} className={activeTab === "sell" ? "active" : ""} onClick={() => setActiveTab("sell")}>
          Sell{myListings && myListings.length > 0 && <span className="count">{myListings.length}</span>}
        </button>
        <button role="tab" aria-selected={activeTab === "burn"} className={activeTab === "burn" ? "active" : ""} onClick={() => setActiveTab("burn")}>
          Retire
        </button>
      </div>

      {activeTab === "buy" && (
        <Panel
          title="Order book"
          lead="AIR minted by citizen miners, cheapest first. Buying settles in test rupees through the Marketplace contract."
          tools={<button className="btn quiet" onClick={reload}><RefreshCw size={14} className={loading ? "spin" : ""} />Refresh</button>}
        >
          {!offers || loading ? (
            <div className="empty"><RefreshCw size={16} className="spin" />Loading listings</div>
          ) : !offers.length ? (
            <div className="empty"><b>Nothing for sale right now</b><span>Miners mint new AIR every minute. Check back shortly, or list your own.</span></div>
          ) : (
            <table className="table book">
              <thead>
                <tr><th>Seller</th><th>Amount</th><th className="r">Price per AIR</th><th className="r">Total</th><th /></tr>
              </thead>
              <tbody>
                {offers.map((l, i) => {
                  const amount = wei(l.amount_air);
                  const price = wei(l.price_tinr);
                  const affordable = Number(tinrBalance) >= price;
                  return (
                    <tr key={l.id} className={i === 0 ? "best" : ""}>
                      <td>
                        <div className="seller">
                          <span className="seller-icon"><Sprout size={14} /></span>
                          <div><b>{sellerName(l.seller) ?? short(l.seller)}</b><code>{short(l.seller)}</code></div>
                        </div>
                      </td>
                      <td>
                        <div className="depth">
                          <span className="num">{air(amount)} AIR</span>
                          <i style={{ width: `${(amount / maxAmount) * 100}%` }} />
                        </div>
                      </td>
                      <td className="r num">{inr(price / amount)}{i === 0 && <span className="tag ok best-tag">Lowest</span>}</td>
                      <td className="r num strong">{inr(price)}</td>
                      <td className="r">
                        <button className="btn ink sm" disabled={buyingId !== null || !affordable} onClick={() => handleBuy(l)}>
                          {buyingId === l.id ? "Buying" : affordable ? "Buy" : "Not enough tINR"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      )}

      {activeTab === "sell" && (
        <div className="split">
          <Panel title="List AIR for sale" lead="Your AIR is held in escrow by the Marketplace contract until someone buys it or you cancel.">
            <form onSubmit={handleListForSale} className="form">
              <label className="field">
                <span className="field-head"><span>Amount</span><small>Balance {airBalance} AIR</small></span>
                <span className="input-wrap"><input inputMode="decimal" value={sellAmount} onChange={(e) => setSellAmount(e.target.value)} /><em>AIR</em></span>
              </label>
              <label className="field">
                <span className="field-head"><span>Total price</span>{sellRate > 0 && Number.isFinite(sellRate) && <small>{inr(sellRate)} per AIR</small>}</span>
                <span className="input-wrap"><input inputMode="decimal" value={sellPrice} onChange={(e) => setSellPrice(e.target.value)} /><em>tINR</em></span>
              </label>
              {floorPrice > 0 && <p className="fine">Lowest price on the market right now is {inr(floorPrice)} per AIR.</p>}
              <button type="submit" className="btn ink block" disabled={sellBusy || !sellAmount || !sellPrice || parseFloat(sellAmount) > parseFloat(airBalance)}>
                {sellBusy ? "Listing on-chain" : "List AIR for sale"}
              </button>
            </form>
          </Panel>
          <Panel title="Your listings" lead="Open to buyers in the order book.">
            {!myListings ? (
              <div className="empty"><RefreshCw size={16} className="spin" />Loading</div>
            ) : !myListings.length ? (
              <div className="empty"><b>No listings yet</b><span>AIR you list appears here and in the order book.</span></div>
            ) : (
              <ul className="mine">
                {myListings.map((l) => (
                  <li key={l.id}>
                    <span className="num">{air(wei(l.amount_air))} AIR</span>
                    <span className="num strong">{inr(wei(l.price_tinr))}</span>
                    <small>{inr(unit(l))} per AIR</small>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}

      {activeTab === "burn" && (
        <div className="split">
          <Panel
            title={obligation ? `Retire against your ${COMPLIANCE_PERIOD} obligation` : "Retire AIR"}
            lead={obligation ? "Burning sends AIR to the ComplianceRegistry, which records it against your obligation. It can't be undone." : "Burning removes AIR from circulation for good and claims the pollution it stands for."}
          >
            {obligation && (
              <div className="obligation compact">
                <div className="obligation-meta"><span><b className="num">{air(obligation.burned, 2)}</b> of {air(obligation.amount, 2)} AIR retired</span><span>{pct.toFixed(0)}%</span></div>
                <div className="obligation-track"><i style={{ width: `${pct}%` }} /></div>
              </div>
            )}
            <form onSubmit={handleRetire} className="form">
              <label className="field">
                <span className="field-head"><span>Amount to retire</span><small>Balance {airBalance} AIR</small></span>
                <span className="input-wrap">
                  <input inputMode="decimal" value={burnAmount} onChange={(e) => setBurnAmount(e.target.value)} />
                  <button type="button" className="max" onClick={() => setBurnAmount(airBalance)}>Max</button>
                  <em>AIR</em>
                </span>
              </label>
              <div className="chips">
                {["0.01", "0.05", "0.10", "0.50"].map((p) => (
                  <button key={p} type="button" className={burnAmount === p ? "active" : ""} onClick={() => setBurnAmount(p)}>{p} AIR</button>
                ))}
              </div>
              <button type="submit" className="btn danger block" disabled={burnBusy || !burnAmount || parseFloat(burnAmount) <= 0 || parseFloat(burnAmount) > parseFloat(airBalance)}>
                <Flame size={16} />
                {burnBusy ? "Retiring on-chain" : `Retire ${burnAmount || "0"} AIR for good`}
              </button>
            </form>
          </Panel>

          <section className={`certificate ${cert ? "issued" : ""}`} aria-label="Retirement certificate">
            <div className="cert-top">
              <span className="cert-seal">{cert ? <Check size={20} /> : <Building2 size={18} />}</span>
              <div>
                <b>Certificate of retirement</b>
                <span>{cert ? `Issued ${new Date(cert.at).toLocaleString("en-IN", { dateStyle: "long", timeStyle: "short" })}` : "Issued when you retire AIR"}</span>
              </div>
            </div>
            <div className="cert-amount">
              <b className="num">{cert ? cert.amount : burnAmount || "0"}</b>
              <span>AIR retired, equal to {cert ? cert.amount : burnAmount || "0"} mg of PM2.5-equivalent removed from the air</span>
            </div>
            <dl className="cert-meta">
              <div><dt>Retired by</dt><dd>{currentWallet.companyName ?? currentWallet.name.replace(/\s*\(.*\)$/, "")}</dd></div>
              <div><dt>Wallet</dt><dd><code>{short(currentWallet.address)}</code></dd></div>
              <div><dt>Counted towards</dt><dd>{obligation ? `${COMPLIANCE_PERIOD} obligation` : "Voluntary retirement"}</dd></div>
              <div>
                <dt>Transaction</dt>
                <dd>
                  {cert?.txHash ? (
                    cert.simulated ? <code>{short(cert.txHash)} (local only)</code> : <a className="hash" href={EXPLORER + cert.txHash} target="_blank" rel="noreferrer">{short(cert.txHash)}</a>
                  ) : "–"}
                </dd>
              </div>
            </dl>
            <p className="cert-foot">1 AIR = 1 mg PM2.5-equivalent, weighted by health damage cost (CE Delft). Verified by device-signed proofs on Polygon Amoy.</p>
          </section>
        </div>
      )}
    </div>
  );
};
