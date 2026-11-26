import { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "../context/WalletContext";
import { fetchBurns, fetchListings, fetchObligations, fetchTrades, type Obligation } from "../services/api";
import { burnAir, burnForCompliance, buyListing, cancelListing, listAirOnMarket } from "../services/chain";
import type { BurnItem, MarketplaceListing, TradeItem } from "../types";
import { AmountInput, Button, COMPLIANCE_PERIOD, Empty, Facts, Field, Section, ago, fmtAir, fmtInr, short, units, when } from "../ui";

export type MarketTab = "buy" | "sell" | "retire";

interface Book {
  listings: MarketplaceListing[];
  trades: TradeItem[];
  burns: BurnItem[];
  obligations: Obligation[];
}

export function Market({ tab, onTab }: { tab: MarketTab; onTab: (t: MarketTab) => void }) {
  const { currentWallet: w, airBalance, tinrBalance, refreshBalances, showToast } = useWallet();
  const me = w.address.toLowerCase();
  const [book, setBook] = useState<Book>({ listings: [], trades: [], burns: [], obligations: [] });
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async () => {
    const [listings, trades, burns, obligations] = await Promise.all([fetchListings(), fetchTrades(), fetchBurns(), fetchObligations()]);
    setBook({ listings, trades, burns, obligations });
    setLoaded(true);
  }, []);
  useEffect(() => {
    reload();
    const t = setInterval(reload, 5000);
    return () => clearInterval(t);
  }, [reload]);

  const after = async (ok: boolean, okMsg: string, err?: string) => {
    showToast(ok ? okMsg : err ?? "Something went wrong", ok ? "success" : "error");
    await Promise.all([reload(), refreshBalances()]);
  };

  const perAir = (l: { amount_air: string; price_tinr: string }) => units(l.price_tinr) / Math.max(units(l.amount_air), 1e-18);
  const others = useMemo(
    () => book.listings.filter((l) => l.seller.toLowerCase() !== me).sort((a, b) => perAir(a) - perAir(b)),
    [book.listings, me],
  );
  const mine = book.listings.filter((l) => l.seller.toLowerCase() === me);
  const lastTrade = book.trades[0];
  const obligation = book.obligations.find((o) => o.company === me && o.period === COMPLIANCE_PERIOD);

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Market</h1>
          <p>Citizens sell the AIR their plants earn. Companies buy it and retire it to offset their pollution.</p>
        </div>
      </header>

      <Facts
        items={[
          ["For sale now", fmtAir(book.listings.reduce((s, l) => s + units(l.amount_air), 0)), "AIR"],
          ["Cheapest", others[0] ? fmtInr(perAir(others[0])) : "—", others[0] ? "per AIR" : undefined],
          ["Last trade", lastTrade ? fmtInr(perAir(lastTrade)) : "—", lastTrade ? `per AIR, ${ago(lastTrade.ts)}` : undefined],
          ["You hold", `${fmtAir(Number(airBalance))} AIR`],
          ["Test money", fmtInr(Number(tinrBalance))],
        ]}
      />

      <div className="tabs" style={{ marginTop: 32 }} role="tablist">
        {(["buy", "sell", "retire"] as const).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? "active" : ""} onClick={() => onTab(t)}>
            {t === "buy" ? "Buy" : t === "sell" ? `Sell${mine.length ? ` (${mine.length} listed)` : ""}` : "Retire"}
          </button>
        ))}
      </div>

      {tab === "buy" && <BuyTab listings={others} trades={book.trades} loaded={loaded} perAir={perAir} after={after} />}
      {tab === "sell" && <SellTab mine={mine} after={after} />}
      {tab === "retire" && <RetireTab obligation={obligation} burns={book.burns} after={after} />}
    </>
  );
}

type After = (ok: boolean, okMsg: string, err?: string) => Promise<void>;

function BuyTab({
  listings,
  trades,
  loaded,
  perAir,
  after,
}: {
  listings: MarketplaceListing[];
  trades: TradeItem[];
  loaded: boolean;
  perAir: (l: { amount_air: string; price_tinr: string }) => number;
  after: After;
}) {
  const { currentWallet, tinrBalance } = useWallet();
  const [busy, setBusy] = useState<number | null>(null);

  const buy = async (l: MarketplaceListing) => {
    setBusy(l.id);
    const r = await buyListing(currentWallet, l.id);
    setBusy(null);
    await after(r.success, `Bought ${fmtAir(units(l.amount_air))} AIR for ${fmtInr(units(l.price_tinr))}`, `Couldn't buy: ${r.error}`);
  };

  return (
    <>
      <div className="panel table-wrap">
        {!listings.length ? (
          <Empty title={loaded ? "Nothing for sale right now" : "Loading listings…"}>
            {loaded && "Miners earn new AIR every minute. Check back soon, or list your own from the Sell tab."}
          </Empty>
        ) : (
          <table className="t">
            <thead>
              <tr>
                <th>Seller</th>
                <th>Listed</th>
                <th className="r">AIR</th>
                <th className="r">Per AIR</th>
                <th className="r">Total</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {listings.map((l) => {
                const cant = units(l.price_tinr) > Number(tinrBalance);
                return (
                  <tr key={l.id}>
                    <td className="mono">{short(l.seller)}</td>
                    <td>{ago(l.created_at)}</td>
                    <td className="r num">{fmtAir(units(l.amount_air))}</td>
                    <td className="r num">{fmtInr(perAir(l))}</td>
                    <td className="r num">{fmtInr(units(l.price_tinr))}</td>
                    <td className="r">
                      <Button size="sm" variant="primary" disabled={busy === l.id || cant} title={cant ? "Not enough test money" : undefined} onClick={() => buy(l)}>
                        {busy === l.id ? "Buying…" : "Buy"}
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <Section title="Recent trades">
        <div className="panel table-wrap">
          {!trades.length ? (
            <Empty title="No trades yet" />
          ) : (
            <table className="t">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Seller</th>
                  <th>Buyer</th>
                  <th className="r">AIR</th>
                  <th className="r">Per AIR</th>
                  <th>Block</th>
                </tr>
              </thead>
              <tbody>
                {trades.slice(0, 10).map((t) => (
                  <tr key={t.tx_hash}>
                    <td>{when(t.ts)}</td>
                    <td className="mono">{short(t.seller)}</td>
                    <td className="mono">{short(t.buyer)}</td>
                    <td className="r num">{fmtAir(units(t.amount_air))}</td>
                    <td className="r num">{fmtInr(perAir(t))}</td>
                    <td className="mono">{t.block_number.toLocaleString("en-IN")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Section>
    </>
  );
}

function SellTab({ mine, after }: { mine: MarketplaceListing[]; after: After }) {
  const { currentWallet, airBalance } = useWallet();
  const [amount, setAmount] = useState("");
  const [price, setPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const a = Number(amount);
  const p = Number(price);
  const valid = a > 0 && p > 0 && a <= Number(airBalance);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    const r = await listAirOnMarket(currentWallet, amount, price);
    setBusy(false);
    if (r.success) {
      setAmount("");
      setPrice("");
    }
    await after(r.success, `Listed ${fmtAir(a)} AIR for ${fmtInr(p)}`, `Couldn't list: ${r.error}`);
  };

  const cancel = async (l: MarketplaceListing) => {
    const r = await cancelListing(currentWallet, l.id);
    await after(r.success, `Listing cancelled. ${fmtAir(units(l.amount_air))} AIR is back in your wallet.`, `Couldn't cancel: ${r.error}`);
  };

  return (
    <div className="grid-2">
      <form className="panel pad form" onSubmit={submit}>
        <Field label={`Amount (you have ${fmtAir(Number(airBalance))} AIR)`}>
          <AmountInput value={amount} onChange={setAmount} unit="AIR" />
        </Field>
        <Field label="Total price">
          <AmountInput value={price} onChange={setPrice} unit="₹" />
        </Field>
        <div className="summary">
          <span className="muted">Price per AIR</span>
          <b className="num">{a > 0 && p > 0 ? fmtInr(p / a) : "—"}</b>
        </div>
        <Button type="submit" variant="primary" disabled={!valid || busy}>
          {busy ? "Listing…" : "List for sale"}
        </Button>
        <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
          The AIR is held by the chain until someone buys it or you cancel. Payment arrives in the same block.
        </p>
      </form>

      <div className="panel table-wrap">
        {!mine.length ? (
          <Empty title="You have nothing listed" />
        ) : (
          <table className="t">
            <thead>
              <tr>
                <th>Listed</th>
                <th className="r">AIR</th>
                <th className="r">Price</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {mine.map((l) => (
                <tr key={l.id}>
                  <td>{ago(l.created_at)}</td>
                  <td className="r num">{fmtAir(units(l.amount_air))}</td>
                  <td className="r num">{fmtInr(units(l.price_tinr))}</td>
                  <td className="r">
                    <Button size="sm" onClick={() => cancel(l)}>
                      Cancel
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function RetireTab({ obligation, burns, after }: { obligation?: Obligation; burns: BurnItem[]; after: After }) {
  const { currentWallet, airBalance } = useWallet();
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const a = Number(amount);
  const valid = a > 0 && a <= Number(airBalance);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    setBusy(true);
    const r = obligation ? await burnForCompliance(currentWallet, COMPLIANCE_PERIOD, amount) : await burnAir(currentWallet, amount);
    setBusy(false);
    if (r.success) setAmount("");
    await after(r.success, `Retired ${fmtAir(a)} AIR`, `Couldn't retire: ${r.error}`);
  };

  const need = obligation ? units(obligation.amount) : 0;
  const done = obligation ? units(obligation.burned) : 0;

  return (
    <>
      <div className="grid-2">
        <form className="panel pad form" onSubmit={submit}>
          <Field label={`Amount to retire (you have ${fmtAir(Number(airBalance))} AIR)`}>
            <AmountInput value={amount} onChange={setAmount} unit="AIR" />
          </Field>
          <Button type="submit" variant="primary" disabled={!valid || busy}>
            {busy ? "Retiring…" : obligation ? `Retire for ${COMPLIANCE_PERIOD} obligation` : "Retire AIR"}
          </Button>
          <p className="faint" style={{ margin: 0, fontSize: 12.5 }}>
            Retiring destroys the AIR for good, so the same clean air can never be claimed twice.
          </p>
        </form>
        <div className="panel pad">
          {obligation ? (
            <>
              <div className="muted">{obligation.company_name}, {obligation.period}</div>
              <div style={{ fontSize: 26, fontWeight: 600, margin: "4px 0 12px" }} className="num">
                {fmtAir(done)} <span className="muted" style={{ fontSize: 16, fontWeight: 500 }}>of {fmtAir(need)} AIR</span>
              </div>
              <div className="progress">
                <i style={{ width: `${Math.min(100, (done / Math.max(need, 1e-18)) * 100)}%` }} />
              </div>
              <p className="muted" style={{ margin: "10px 0 0", fontSize: 13.5 }}>
                The regulator set this obligation. Every retirement counts toward it, on every node, immediately.
              </p>
            </>
          ) : (
            <p className="muted" style={{ margin: 0 }}>
              You have no compliance obligation. Retiring is voluntary: it permanently takes the credit off the market, so
              the clean air it represents counts for you alone.
            </p>
          )}
        </div>
      </div>

      <Section title="Recent retirements">
        <div className="panel table-wrap">
          {!burns.length ? (
            <Empty title="No AIR retired yet" />
          ) : (
            <table className="t">
              <thead>
                <tr>
                  <th>When</th>
                  <th>By</th>
                  <th>For</th>
                  <th className="r">AIR</th>
                </tr>
              </thead>
              <tbody>
                {burns.slice(0, 10).map((b) => (
                  <tr key={b.tx_hash}>
                    <td>{when(b.ts)}</td>
                    <td>{b.company_name ?? <span className="mono">{short(b.company)}</span>}</td>
                    <td>{b.period ? `${b.period} obligation` : "Voluntary"}</td>
                    <td className="r num">{fmtAir(units(b.amount))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Section>
    </>
  );
}
