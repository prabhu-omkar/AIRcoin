import React, { useState, useEffect } from "react";
import { useWallet } from "../../context/WalletContext";
import { CertificateModal } from "../CertificateModal";
import { burnForCompliance, buyListing } from "../../services/chain";
import { fetchListings, fetchBurns } from "../../services/api";
import { BurnItem, MarketplaceListing } from "../../types";
import { Button } from "../ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "../ui/table";
import {
  Building2,
  Flame,
  Award,
  ShieldCheck,
  Check,
} from "lucide-react";

export const CompanyPortal: React.FC = () => {
  const { currentWallet, airBalance, tinrBalance, refreshBalances, showToast } = useWallet();

  const [obligationPeriod, setObligationPeriod] = useState("2026");
  const [totalObligation, setTotalObligation] = useState(5.0);
  const [burnedToDate, setBurnedToDate] = useState(1.5);
  const [burnAmountInput, setBurnAmountInput] = useState("1.0");
  const [isBurning, setIsBurning] = useState(false);
  const [isBuyingAndBurning, setIsBuyingAndBurning] = useState(false);

  const [certModalOpen, setCertModalOpen] = useState(false);
  const [certificateData, setCertificateData] = useState({
    companyName: currentWallet.companyName || "Apex Steel Works Ltd",
    companyAddress: currentWallet.address,
    amountAir: "1.5000",
    period: "2026",
    txHash: "0x7892af09b83c19e847d0928e19c02847a9829e10293847561029384756102938",
    timestamp: Date.now() - 3600000,
  });

  const [burns, setBurns] = useState<BurnItem[]>([
    {
      company: currentWallet.address,
      company_name: currentWallet.companyName || "Apex Steel Works Ltd",
      period: "2026",
      amount: "1500000000000000000",
      obligation: "5000000000000000000",
      burned_to_date: "1500000000000000000",
      tx_hash: "0x7892af09b83c19e847d0928e19c02847a9829e10293847561029384756102938",
      block_number: 18231,
      ts: Date.now() - 3600000,
    },
  ]);

  useEffect(() => {
    async function loadData() {
      const burnsData = await fetchBurns();
      if (burnsData && burnsData.length > 0) {
        setBurns(burnsData);
        const myBurns = burnsData.filter(
          (b) => b.company.toLowerCase() === currentWallet.address.toLowerCase()
        );
        if (myBurns.length > 0) {
          const total = myBurns.reduce((sum, b) => sum + parseFloat(b.amount) / 1e18, 0);
          setBurnedToDate(total);
        }
      }
    }
    loadData();
  }, [currentWallet]);

  const percentageFulfilled = Math.min(100, Math.round((burnedToDate / totalObligation) * 100));
  const remainingShortfall = Math.max(0, totalObligation - burnedToDate);

  const handleBurn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWallet.privateKey) {
      showToast("Private key required", "error");
      return;
    }
    if (parseFloat(airBalance) < parseFloat(burnAmountInput)) {
      showToast("Insufficient AIR balance. Acquire from marketplace.", "error");
      return;
    }

    setIsBurning(true);
    const res = await burnForCompliance(currentWallet.privateKey, obligationPeriod, burnAmountInput);
    setIsBurning(false);

    if (res.success && res.txHash) {
      showToast(`Burned ${burnAmountInput} AIR for ${obligationPeriod}`, "success");
      const newBurned = burnedToDate + parseFloat(burnAmountInput);
      setBurnedToDate(newBurned);

      setCertificateData({
        companyName: currentWallet.companyName || "Apex Steel Works Ltd",
        companyAddress: currentWallet.address,
        amountAir: burnAmountInput,
        period: obligationPeriod,
        txHash: res.txHash,
        timestamp: Date.now(),
      });
      setCertModalOpen(true);
      await refreshBalances();
    } else {
      showToast(res.error || "Burn failed", "error");
    }
  };

  const handleBuyAndBurn = async () => {
    if (!currentWallet.privateKey) {
      showToast("Private key required", "error");
      return;
    }
    setIsBuyingAndBurning(true);
    showToast("Executing Buy & Burn...", "info");

    const listings = await fetchListings();
    const active = listings.find((l) => l.status === "active");

    if (active) {
      await buyListing(currentWallet.privateKey, active.id, (parseFloat(active.price_tinr) / 1e18).toString());
    }

    const burnRes = await burnForCompliance(currentWallet.privateKey, obligationPeriod, "1.0");
    setIsBuyingAndBurning(false);

    if (burnRes.success && burnRes.txHash) {
      showToast("Buy and Burn completed", "success");
      const newBurned = burnedToDate + 1.0;
      setBurnedToDate(newBurned);
      setCertificateData({
        companyName: currentWallet.companyName || "Apex Steel Works Ltd",
        companyAddress: currentWallet.address,
        amountAir: "1.0000",
        period: obligationPeriod,
        txHash: burnRes.txHash,
        timestamp: Date.now(),
      });
      setCertModalOpen(true);
      await refreshBalances();
    } else {
      showToast(burnRes.error || "Execution error", "error");
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* 4 Clean Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-[11px] font-mono uppercase text-muted-foreground">Entity</div>
            <div className="font-medium text-sm text-foreground truncate mt-1">
              {currentWallet.companyName || "Apex Steel Works Ltd"}
            </div>
            <div className="text-[11px] font-mono text-muted-foreground truncate mt-0.5">
              {currentWallet.address.slice(0, 10)}...
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-[11px] font-mono uppercase text-muted-foreground">Statutory Quota</div>
            <div className="font-mono text-xl font-semibold text-foreground mt-1">
              {totalObligation.toFixed(2)} AIR
            </div>
            <div className="text-[11px] text-muted-foreground font-mono mt-0.5">Period {obligationPeriod}</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-[11px] font-mono uppercase text-muted-foreground">Retired to Date</div>
            <div className="font-mono text-xl font-semibold text-foreground mt-1">
              {burnedToDate.toFixed(2)} AIR
            </div>
            <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
              ≈ {(burnedToDate * 1000).toFixed(0)} mg PM2.5 neutralized
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-[11px] font-mono uppercase text-muted-foreground">Fulfillment</div>
            <div className="font-mono text-xl font-semibold text-foreground mt-1">
              {percentageFulfilled}%
            </div>
            <div className="text-[11px] font-mono mt-0.5">
              {remainingShortfall > 0 ? (
                <span className="text-muted-foreground">{remainingShortfall.toFixed(2)} AIR shortfall</span>
              ) : (
                <span className="text-emerald-600">Fully Compliant</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: Obligation Progress & Direct Burn */}
      <div className="grid grid-cols-3 gap-6">
        <Card className="col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle>
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <span>Statutory Compliance Progress</span>
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCertModalOpen(true)}
              className="gap-1 border-border text-xs"
            >
              <Award className="h-3.5 w-3.5 text-muted-foreground" />
              View Certificate
            </Button>
          </CardHeader>
          <CardContent className="space-y-4 pt-3">
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-muted-foreground">Retired: {burnedToDate.toFixed(2)} AIR</span>
                <span className="text-muted-foreground">Target: {totalObligation.toFixed(2)} AIR</span>
              </div>
              <div className="h-2 w-full rounded bg-muted border border-border overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${percentageFulfilled}%` }}
                />
              </div>
            </div>

            {/* Direct Burn Form */}
            <form onSubmit={handleBurn} className="border-t border-border/80 pt-4 space-y-3">
              <div className="text-xs font-medium text-foreground">Retire AIR from Wallet</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-mono uppercase text-muted-foreground block mb-1">
                    Compliance Period
                  </label>
                  <Input
                    type="text"
                    value={obligationPeriod}
                    onChange={(e) => setObligationPeriod(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="text-[10px] font-mono uppercase text-muted-foreground block mb-1">
                    Amount to Retire (AIR)
                  </label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={burnAmountInput}
                    onChange={(e) => setBurnAmountInput(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div className="flex justify-between items-center pt-1">
                <span className="text-[11px] font-mono text-muted-foreground">
                  Wallet: {airBalance} AIR
                </span>
                <Button type="submit" size="sm" disabled={isBurning}>
                  {isBurning ? "Retiring..." : "Retire On-Chain"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>

        {/* 1-Click Buy & Burn Stream */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <span>Atomic Buy & Burn</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-3 text-xs">
            <p className="text-muted-foreground leading-normal">
              Acquires the lowest active marketplace listing and retires the credits in a single automated step.
            </p>
            <div className="rounded border border-border bg-card p-3 space-y-1.5 font-mono text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Lot:</span>
                <span className="text-foreground">1.0 AIR</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Treasury:</span>
                <span className="text-foreground">₹{tinrBalance}</span>
              </div>
            </div>
            <Button
              onClick={handleBuyAndBurn}
              disabled={isBuyingAndBurning}
              className="w-full text-xs"
            >
              {isBuyingAndBurning ? "Executing..." : "Execute Buy & Burn"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Historical Compliance Retirement Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>
            <Award className="h-4 w-4 text-muted-foreground" />
            <span>Retirement Audit Ledger</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Period</TableHead>
                <TableHead>Entity</TableHead>
                <TableHead>Retired (AIR)</TableHead>
                <TableHead>Cumulative</TableHead>
                <TableHead>Transaction Hash</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {burns.map((b, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-mono text-foreground">{b.period}</TableCell>
                  <TableCell className="text-foreground/80">{b.company_name || "Apex Steel Works"}</TableCell>
                  <TableCell className="font-mono text-foreground">
                    {(parseFloat(b.amount) / 1e18).toFixed(4)} AIR
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {(parseFloat(b.burned_to_date) / 1e18).toFixed(4)} AIR
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-muted-foreground">
                    {b.tx_hash.slice(0, 10)}...{b.tx_hash.slice(-6)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setCertificateData({
                          companyName: b.company_name || "Apex Steel Works Ltd",
                          companyAddress: b.company,
                          amountAir: (parseFloat(b.amount) / 1e18).toFixed(4),
                          period: b.period,
                          txHash: b.tx_hash,
                          timestamp: b.ts,
                        });
                        setCertModalOpen(true);
                      }}
                      className="h-6 px-2 text-[10px]"
                    >
                      Certificate
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <CertificateModal
        isOpen={certModalOpen}
        onClose={() => setCertModalOpen(false)}
        certificateData={certificateData}
      />
    </div>
  );
};
