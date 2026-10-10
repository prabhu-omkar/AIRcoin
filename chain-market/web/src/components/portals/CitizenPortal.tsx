import React, { useState, useEffect } from "react";
import { useWallet } from "../../context/WalletContext";
import { listAirOnMarket } from "../../services/chain";
import { fetchMinerMints } from "../../services/api";
import { MintItem, MinerApplication } from "../../types";
import { Button } from "../ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { Input } from "../ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../ui/dialog";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "../ui/table";
import {
  Cpu,
  MapPin,
  TrendingUp,
  Plus,
  Radio,
  ExternalLink,
  ShieldCheck,
} from "lucide-react";

export const CitizenPortal: React.FC = () => {
  const { currentWallet, airBalance, tinrBalance, refreshBalances, showToast } = useWallet();

  const [mints, setMints] = useState<MintItem[]>([
    {
      miner_id: "miner-001",
      epoch: 29863320,
      amount: "27684000000000000",
      to: currentWallet.address,
      evidence_hash: "0xc0bd49585d03da599e97092962060e592dd9b0dcab23229260bd38c599b9f431",
      tx_hash: "0x8c3d5d3849fd472bb70e93be08d4cc384e91e0c3186d1c78ea82a174479eeaf0",
      block_number: 18234,
      ts: Date.now() - 60000,
    },
    {
      miner_id: "miner-001",
      epoch: 29863319,
      amount: "25420000000000000",
      to: currentWallet.address,
      evidence_hash: "0xa1fa893245bb19c084d59a71b190f84501eb815adcf991823b12389104fa2841",
      tx_hash: "0x321fcb4859a0184b23849c7193bca9817f098192a819b183918274a123985718",
      block_number: 18233,
      ts: Date.now() - 120000,
    },
  ]);

  const [showSellModal, setShowSellModal] = useState(false);
  const [sellAmount, setSellAmount] = useState("1.0");
  const [sellPrice, setSellPrice] = useState("500");
  const [isSelling, setIsSelling] = useState(false);

  const [showApplyModal, setShowApplyModal] = useState(false);
  const [applicantName, setApplicantName] = useState("Alice Garden");
  const [applyLocation, setApplyLocation] = useState("Koramangala 4th Block, Bangalore");
  const [plantCount, setPlantCount] = useState(20);

  useEffect(() => {
    async function loadData() {
      const res = await fetchMinerMints("miner-001");
      if (res && res.items && res.items.length > 0) {
        setMints(res.items);
      }
    }
    loadData();
  }, []);

  const handleCreateListing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWallet.privateKey) {
      showToast("Private key required", "error");
      return;
    }
    setIsSelling(true);
    const res = await listAirOnMarket(currentWallet.privateKey, sellAmount, sellPrice);
    setIsSelling(false);
    if (res.success) {
      showToast(`Created order: ${sellAmount} AIR for ₹${sellPrice}`, "success");
      setShowSellModal(false);
      await refreshBalances();
    } else {
      showToast(res.error || "Failed to create listing", "error");
    }
  };

  const handleApply = (e: React.FormEvent) => {
    e.preventDefault();
    setShowApplyModal(false);
    showToast(`Application submitted to regulator`, "success");
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* 4 Clean Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-[11px] font-mono uppercase text-zinc-400">Balance</div>
            <div className="font-mono text-xl font-semibold text-zinc-100 mt-1">{airBalance} AIR</div>
            <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
              ≈ {(parseFloat(airBalance) * 1000).toFixed(0)} mg PM2.5-eq
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-[11px] font-mono uppercase text-zinc-400">Treasury</div>
            <div className="font-mono text-xl font-semibold text-zinc-100 mt-1">₹{tinrBalance}</div>
            <div className="text-[11px] text-zinc-400 font-mono mt-0.5">Rupee Stablecoin (tINR)</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-[11px] font-mono uppercase text-zinc-400">Hardware Node</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="font-mono text-base font-medium text-zinc-100">miner-001</span>
              <Badge variant="emerald">ACTIVE</Badge>
            </div>
            <div className="text-[11px] text-zinc-400 font-mono mt-0.5">20 Registered Plants</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-[11px] font-mono uppercase text-zinc-400">Geofence</div>
            <div className="font-mono text-xs text-zinc-200 mt-1 flex items-center gap-1.5">
              <MapPin className="h-3 w-3 text-zinc-400" />
              <span>12.9716, 77.5946</span>
            </div>
            <div className="text-[11px] text-zinc-400 font-mono mt-0.5">Radius: 50m (tdr1v9qtj)</div>
          </CardContent>
        </Card>
      </div>

      {/* Main Grid: Node Telemetry & Quick Action */}
      <div className="grid grid-cols-3 gap-6">
        <Card className="col-span-2">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <CardTitle>
              <Cpu className="h-4 w-4 text-zinc-400" />
              <span>Registered Hardware & Location</span>
            </CardTitle>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setShowSellModal(true)} className="gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" />
                Sell AIR
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-3">
            <div className="grid grid-cols-2 gap-4 text-xs font-mono">
              <div className="rounded border border-zinc-800 bg-zinc-950 p-3 space-y-1">
                <div className="text-[10px] uppercase text-zinc-400">Device Address</div>
                <div className="text-zinc-200 truncate">0x61D11eC15342C7ea815362684375244da20112C6</div>
              </div>
              <div className="rounded border border-zinc-800 bg-zinc-950 p-3 space-y-1">
                <div className="text-[10px] uppercase text-zinc-400">Owner Wallet</div>
                <div className="text-zinc-200 truncate">{currentWallet.address}</div>
              </div>
              <div className="rounded border border-zinc-800 bg-zinc-950 p-3 space-y-1">
                <div className="text-[10px] uppercase text-zinc-400">ArUco Tag Range</div>
                <div className="text-zinc-200">Tags #0 – #19 (20 Sensors)</div>
              </div>
              <div className="rounded border border-zinc-800 bg-zinc-950 p-3 space-y-1">
                <div className="text-[10px] uppercase text-zinc-400">Telemetry Stream</div>
                <div className="text-emerald-400">C2 MQTT 1.0 msg/s</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Rig Application Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>
              <Radio className="h-4 w-4 text-zinc-400" />
              <span>Hardware Fleet</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 pt-3">
            <p className="text-xs text-zinc-400 leading-normal">
              Apply to provision additional camera rigs with tamper-evident ArUco stickers verified by CPCB.
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowApplyModal(true)}
              className="w-full gap-1 border-zinc-800 text-xs"
            >
              <Plus className="h-3.5 w-3.5 text-zinc-400" />
              Apply for Hardware Rig
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Epoch Mint History */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle>
            <ShieldCheck className="h-4 w-4 text-zinc-400" />
            <span>Epoch Mint Ledger</span>
          </CardTitle>
          <span className="text-[11px] font-mono text-zinc-400">Verified On-Chain</span>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Epoch</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Evidence Hash</TableHead>
                <TableHead>Transaction</TableHead>
                <TableHead>Timestamp</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mints.map((m, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-mono font-medium text-zinc-100">
                    #{m.epoch}
                  </TableCell>
                  <TableCell className="font-mono text-zinc-100">
                    {(parseFloat(m.amount) / 1e18).toFixed(6)} AIR
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-zinc-400">
                    {m.evidence_hash.slice(0, 10)}...{m.evidence_hash.slice(-6)}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-zinc-400">
                    {m.tx_hash.slice(0, 8)}...{m.tx_hash.slice(-6)}
                  </TableCell>
                  <TableCell className="text-[11px] text-zinc-400">
                    {new Date(m.ts).toLocaleTimeString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge variant="emerald">MINTED</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog: Sell AIR */}
      <Dialog open={showSellModal} onOpenChange={setShowSellModal}>
        <DialogContent onClose={() => setShowSellModal(false)}>
          <DialogHeader>
            <DialogTitle>List AIR on Marketplace</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateListing} className="space-y-4">
            <div>
              <label className="text-[11px] font-mono uppercase text-zinc-400 block mb-1">
                Amount (AIR)
              </label>
              <Input
                type="number"
                step="0.001"
                min="0.001"
                max={airBalance}
                value={sellAmount}
                onChange={(e) => setSellAmount(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-[11px] font-mono uppercase text-zinc-400 block mb-1">
                Total Price (tINR)
              </label>
              <Input
                type="number"
                step="1"
                min="1"
                value={sellPrice}
                onChange={(e) => setSellPrice(e.target.value)}
                required
              />
            </div>
            <div className="text-[11px] font-mono text-zinc-400">
              Unit Rate: ₹{(parseFloat(sellPrice) / (parseFloat(sellAmount) || 1)).toFixed(2)} per AIR
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowSellModal(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSelling}>
                {isSelling ? "Depositing..." : "Deposit into Escrow"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog: Apply for Rig */}
      <Dialog open={showApplyModal} onOpenChange={setShowApplyModal}>
        <DialogContent onClose={() => setShowApplyModal(false)}>
          <DialogHeader>
            <DialogTitle>Apply for Hardware Rig</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleApply} className="space-y-4">
            <div>
              <label className="text-[11px] font-mono uppercase text-zinc-400 block mb-1">
                Site Name
              </label>
              <Input
                type="text"
                value={applicantName}
                onChange={(e) => setApplicantName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-[11px] font-mono uppercase text-zinc-400 block mb-1">
                Installation Location
              </label>
              <Input
                type="text"
                value={applyLocation}
                onChange={(e) => setApplyLocation(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowApplyModal(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Submit Application
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
