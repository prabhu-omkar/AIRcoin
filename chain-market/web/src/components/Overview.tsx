import { useCallback, useEffect, useState } from "react";
import { Box, ExternalLink } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import {
  CHAIN_URL,
  fetchBurns,
  fetchMiner,
  fetchMinerMints,
  fetchObligations,
  fetchRejections,
  fetchTrades,
  type Obligation,
} from "../services/api";
import type { BurnItem, C4MinerData, RejectionRecord, TradeItem } from "../types";
import {
  Button,
  COMPLIANCE_PERIOD,
  Empty,
  EpochStrip,
  Facts,
  Section,
  ago,
  fmtAir,
  fmtInr,
  short,
  twinUrl,
  units,
  when,
} from "../ui";
import { MinerRequest } from "./Regulator";
import type { MarketTab } from "./Market";

interface Mint {
  epoch: number;
  amount: string;
  tx_hash: string;
  block_number: number;
  ts: number;
}

function usePolled<T>(load: () => Promise<T>, initial: T, ms = 8000): T {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    let live = true;
    const run = () => load().then((x) => live && setV(x));
    run();
    const t = setInterval(run, ms);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [load, ms]);
  return v;
}

export function Overview({ onMarket }: { onMarket: (tab: MarketTab) => void }) {
  const { currentWallet: w, airBalance, tinrBalance, claimFreeFaucet } = useWallet();
  const air = Number(airBalance);
  const minerId = w.minerId;
  const [faucetBusy, setFaucetBusy] = useState(false);

  const loadMiner = useCallback(async () => {
    if (!minerId) return null;
    const [miner, mints, rejections] = await Promise.all([
      fetchMiner(minerId),
      fetchMinerMints(minerId, 60),
      fetchRejections(minerId),
    ]);
    return { miner, mints: (mints.items ?? []) as Mint[], rejections };
  }, [minerId]);
  const mine = usePolled<{ miner: C4MinerData | null; mints: Mint[]; rejections: RejectionRecord[] } | null>(loadMiner, null);

  const loadCompany = useCallback(async () => {
    if (w.role !== "company") return null;
    const me = w.address.toLowerCase();
    const [obs, trades, burns] = await Promise.all([fetchObligations(), fetchTrades(), fetchBurns()]);
    return {
      obligation: obs.find((o) => o.company === me && o.period === COMPLIANCE_PERIOD) ?? null,
      trades: trades.filter((t: TradeItem) => t.buyer === me),
      burns: burns.filter((b: BurnItem) => b.company === me),
    };
  }, [w.role, w.address]);
  const company = usePolled<{ obligation: Obligation | null; trades: TradeItem[]; burns: BurnItem[] } | null>(loadCompany, null);

  const faucet = async () => {
    setFaucetBusy(true);
    await claimFreeFaucet();
    setFaucetBusy(false);
  };

  const miner = mine?.miner;
  const t = miner?.totals;
  const lastMint = mine?.mints[0];

  return (
    <>
      <header className="page-head">
        <div>
          <h1>{greeting(w.name, w.role)}</h1>
          <p>{lead(w.role, minerId)}</p>
        </div>
      </header>

      <div className="hero">
        <div>
          <div className="balance-label">Your AIR</div>
          <div className="balance num">
            {fmtAir(air)}
            <small>AIR</small>
          </div>
          <div className="balance-note">
            {w.role === "company"
              ? "AIR you hold and haven't retired yet. Retiring it counts toward your obligation."
              : `That's ${fmtAir(air)} mg of PM2.5-equivalent pollution your share of plants kept out of the air.`}
          </div>
          <div className="hero-actions">
            {w.role === "company" ? (
              <>
                <Button variant="primary" onClick={() => onMarket("buy")}>Buy AIR</Button>
                <Button onClick={() => onMarket("retire")} disabled={air <= 0}>Retire AIR</Button>
              </>
            ) : (
              <>
                <Button variant="primary" onClick={() => onMarket("sell")} disabled={air <= 0}>Sell AIR</Button>
                <Button onClick={() => onMarket("buy")}>Buy AIR</Button>
              </>
            )}
            <Button variant="ghost" onClick={faucet} disabled={faucetBusy}>
              {faucetBusy ? "Adding…" : "Add ₹1,000 test money"}
            </Button>
          </div>
        </div>

        {w.role === "company" && company?.obligation ? (
          <ObligationView o={company.obligation} />
        ) : minerId ? (
          <EpochStrip
            mints={mine?.mints ?? []}
            rejected={mine?.rejections.map((r) => r.epoch)}
            label={<span>AIR minted by {minerId} each minute</span>}
          />
        ) : (
          <div />
        )}
      </div>

      <div className="section">
        <Facts
          items={
            minerId
              ? [
                  ["Test money", fmtInr(Number(tinrBalance))],
                  ["Minted by your miner", t ? fmtAir(units(t.minted)) : "—", "AIR"],
                  ["Epochs verified", t ? t.epochs_minted.toLocaleString("en-IN") : "—"],
                  ["Rejected", t ? t.epochs_rejected.toLocaleString("en-IN") : "—"],
                  ["Last mint", lastMint ? ago(lastMint.ts) : "—"],
                ]
              : w.role === "company" && company
                ? [
                    ["Test money", fmtInr(Number(tinrBalance))],
                    ["Bought", fmtAir(company.trades.reduce((s, x) => s + units(x.amount_air), 0)), "AIR"],
                    ["Retired", fmtAir(company.burns.reduce((s, x) => s + units(x.amount), 0)), "AIR"],
                  ]
                : [
                    ["Test money", fmtInr(Number(tinrBalance))],
                    ["AIR held", fmtAir(air), "AIR"],
                  ]
          }
        />
      </div>

      {minerId && miner && (
        <Section
          title={`Your miner, ${miner.miner_id}`}
          sub={`${(miner.location as any).label ?? "Registered site"} · ${miner.sticker_ids.length} tagged plants`}
          action={
            <a className="btn sm" href={twinUrl(minerId)} target="_blank" rel="noreferrer">
              <Box size={15} /> Open digital twin
            </a>
          }
        >
          <div className="grid-2">
            <div className="panel pad">
              <dl className="kv">
                <dt>Status</dt>
                <dd>{miner.status === "active" ? <span className="tag ok">Active</span> : <span className="tag bad">Suspended</span>}</dd>
                <dt>Registered</dt>
                <dd>{when(miner.registered_at)}</dd>
                <dt>Location</dt>
                <dd className="mono">
                  {miner.location.lat.toFixed(4)}, {miner.location.lon.toFixed(4)} (±{miner.location.geofence_m} m)
                </dd>
                <dt>Device key</dt>
                <dd className="mono">{short(miner.device_address)}</dd>
              </dl>
            </div>
            <div className="panel pad">
              <dl className="kv">
                <dt>How it earns</dt>
                <dd style={{ textAlign: "left", fontWeight: 400 }} className="muted">
                  Every minute the camera checks each plant, estimates what it removed and signs a proof. Each chain
                  node re-checks the signature, stickers, location and caps before minting to your wallet.
                </dd>
              </dl>
            </div>
          </div>
        </Section>
      )}

      {minerId && (
        <Section title="Recent mints" sub="Each row is one verified minute of plant work.">
          <div className="panel table-wrap">
            {!mine?.mints.length ? (
              <Empty title="No mints yet">Your miner's first proof is minted within a minute of it coming online.</Empty>
            ) : (
              <table className="t">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Epoch</th>
                    <th>Block</th>
                    <th>Transaction</th>
                    <th className="r">AIR</th>
                  </tr>
                </thead>
                <tbody>
                  {mine.mints.slice(0, 10).map((m) => (
                    <tr key={m.epoch}>
                      <td>{when(m.ts)}</td>
                      <td className="mono">{m.epoch}</td>
                      <td className="mono">{m.block_number.toLocaleString("en-IN")}</td>
                      <td className="mono">
                        <a href={`${CHAIN_URL}/v1/miners/${minerId}/mints?limit=50`} target="_blank" rel="noreferrer">
                          {short(m.tx_hash)}
                        </a>
                      </td>
                      <td className="r num">+{fmtAir(units(m.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </Section>
      )}

      {minerId && !!mine?.rejections.length && (
        <Section title="Rejected proofs" sub="Proofs the network refused. Repeated rejections can get a miner suspended.">
          <div className="panel table-wrap">
            <table className="t">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Epoch</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {mine.rejections.slice(0, 5).map((r) => (
                  <tr key={r.tx_hash}>
                    <td>{when(r.ts)}</td>
                    <td className="mono">{r.epoch}</td>
                    <td>
                      <span className="tag bad">{r.reason_code.replace(/_/g, " ")}</span> <span className="muted">{r.reason}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {w.role === "company" && company && (
        <Section title="Activity" sub="Your purchases and retirements on the chain.">
          <div className="panel table-wrap">
            {!company.trades.length && !company.burns.length ? (
              <Empty title="Nothing yet">Buy AIR from a citizen's listing, then retire it here to meet your obligation.</Empty>
            ) : (
              <table className="t">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>What</th>
                    <th>Transaction</th>
                    <th className="r">AIR</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ...company.trades.map((x) => ({ ts: x.ts, what: `Bought from ${short(x.seller)} for ${fmtInr(units(x.price_tinr))}`, tx: x.tx_hash, air: units(x.amount_air), sign: "+" })),
                    ...company.burns.map((x) => ({ ts: x.ts, what: `Retired${x.period ? ` for ${x.period}` : ""}`, tx: x.tx_hash, air: units(x.amount), sign: "−" })),
                  ]
                    .sort((a, b) => b.ts - a.ts)
                    .slice(0, 12)
                    .map((r) => (
                      <tr key={r.tx + r.what}>
                        <td>{when(r.ts)}</td>
                        <td>{r.what}</td>
                        <td className="mono">{short(r.tx)}</td>
                        <td className="r num">
                          {r.sign}
                          {fmtAir(r.air)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            )}
          </div>
        </Section>
      )}

      {w.role === "citizen" && !minerId && <MinerRequest />}

      {w.role === "admin" && (
        <Section title="Regulator tools">
          <p className="muted">Miner requests, the fleet, the anti-cheat log and obligations are on the Regulator page.</p>
        </Section>
      )}

      <p className="faint" style={{ marginTop: 40, fontSize: 12.5 }}>
        Wallet <span className="mono">{w.address.toLowerCase()}</span> · reading from{" "}
        <a href={`${CHAIN_URL}/v1/status`} target="_blank" rel="noreferrer">
          {CHAIN_URL.replace(/^https?:\/\//, "")} <ExternalLink size={11} />
        </a>
      </p>
    </>
  );
}

function ObligationView({ o }: { o: Obligation }) {
  const need = units(o.amount);
  const done = units(o.burned);
  const pct = Math.min(100, (done / Math.max(need, 1e-18)) * 100);
  return (
    <div>
      <div className="balance-label">{o.period} obligation</div>
      <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: "-.02em", margin: "2px 0 12px" }} className="num">
        {fmtAir(done)} <span className="muted" style={{ fontSize: 18, fontWeight: 500 }}>of {fmtAir(need)} AIR retired</span>
      </div>
      <div className="progress">
        <i style={{ width: `${pct}%` }} />
      </div>
      <p className="muted" style={{ margin: "10px 0 0", fontSize: 13.5 }}>
        {pct >= 100 ? "Obligation met for this period." : `${fmtAir(Math.max(0, need - done))} AIR still to retire.`}
      </p>
    </div>
  );
}

function greeting(name: string, role: string) {
  if (role === "company") return name.replace(/\s*\(.*\)\s*$/, "");
  if (role === "admin") return "Regulator";
  if (name.startsWith("0x")) return "Welcome";
  const first = name.split(" ")[0];
  const h = new Date().getHours();
  return `${h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening"}, ${first}`;
}

function lead(role: string, minerId?: string) {
  if (role === "company") return "Buy verified clean-air credits from citizens and retire them against your obligation.";
  if (role === "admin") return "The network at a glance.";
  return minerId
    ? `Here's what ${minerId} has earned. A new proof arrives every minute.`
    : "Hold, buy and retire AIR, or request a miner to start earning it.";
}
