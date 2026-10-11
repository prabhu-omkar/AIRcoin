import React, { useState, useEffect } from "react";
import { useWallet } from "../../context/WalletContext";
import { fetchRejections, fetchTotals } from "../../services/api";
import { registerMinerOnChain, setMinerActiveOnChain, setObligationOnChain } from "../../services/chain";
import { RejectionRecord, MinerApplication } from "../../types";
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
  Landmark,
  ShieldAlert,
  Check,
  X,
  MapPin,
  Pause,
  Play,
  Layers,
} from "lucide-react";

export const AdminPortal: React.FC = () => {
  const { currentWallet, showToast } = useWallet();

  const [networkTotals, setNetworkTotals] = useState({
    minted: "148.5200",
    burned: "42.8000",
    activeMiners: 14,
  });

  const [rejections, setRejections] = useState<RejectionRecord[]>([
    {
      id: 1,
      miner_id: "miner-002",
      epoch: 29863318,
      status: "rejected",
      reason_code: "sticker_claimed_by_other_miner",
      reason: "Sticker 12 registered to miner-001 (reuse detected)",
      created_at: new Date(Date.now() - 300000).toISOString(),
    },
    {
      id: 2,
      miner_id: "miner-001",
      epoch: 29863315,
      status: "rejected",
      reason_code: "gps_outside_geofence",
      reason: "GPS 420m from site (max 50m)",
      created_at: new Date(Date.now() - 600000).toISOString(),
    },
    {
      id: 3,
      miner_id: "miner-003",
      epoch: 29863300,
      status: "rejected",
      reason_code: "amount_over_cap",
      reason: "Amount 2.450 AIR exceeds cap (1.0 AIR)",
      created_at: new Date(Date.now() - 1200000).toISOString(),
    },
  ]);

  const [miners, setMiners] = useState([
    {
      id: "miner-001",
      deviceAddress: "0x61D11eC15342C7ea815362684375244da20112C6",
      ownerWallet: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      geohash: "tdr1v9qtj",
      stickers: "0–19",
      status: "active",
    },
    {
      id: "miner-002",
      deviceAddress: "0x3cBc0a3c2F63d695A58b5A7Aa5Af891647BCF086",
      ownerWallet: "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
      geohash: "tdr1w6u3j",
      stickers: "20–39",
      status: "active",
    },
  ]);

  const [pendingApps, setPendingApps] = useState<MinerApplication[]>([
    {
      id: "APP-BLR-0284",
      applicantName: "HSR Community Garden",
      ownerWallet: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
      locationLabel: "HSR Sector 2, Bangalore",
      lat: 12.9121,
      lon: 77.6446,
      geohash: "tdr1v8k9q",
      plantCount: 20,
      status: "submitted",
      submittedAt: Date.now() - 7200000,
    },
  ]);

  const [obligCompany, setObligCompany] = useState("0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC");
  const [obligPeriod, setObligPeriod] = useState("2026");
  const [obligAmount, setObligAmount] = useState("5.0");

  useEffect(() => {
    async function loadData() {
      const rejData = await fetchRejections();
      if (rejData && rejData.length > 0) {
        setRejections(rejData);
      }
      const totals = await fetchTotals();
      if (totals && totals.mints) {
        setNetworkTotals((prev) => ({
          ...prev,
          minted: (parseFloat(totals.mints.total) / 1e18).toFixed(4),
          burned: totals.burns ? (parseFloat(totals.burns.total) / 1e18).toFixed(4) : prev.burned,
        }));
      }
    }
    loadData();
  }, []);

  const handleApproveApp = async (app: MinerApplication) => {
    const newMinerId = `miner-00${miners.length + 1}`;
    const mockDeviceAddress = "0x" + Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    const stickerStart = miners.length * 20;

    if (currentWallet.privateKey) {
      const result = await registerMinerOnChain(
        currentWallet.privateKey,
        newMinerId,
        mockDeviceAddress,
        app.ownerWallet,
        Array.from({ length: 20 }, (_, i) => stickerStart + i),
        app.geohash
      );
      if (!result.success) {
        showToast(result.error || "On-chain registration failed", "error");
        return;
      }
    }

    setMiners([
      ...miners,
      {
        id: newMinerId,
        deviceAddress: mockDeviceAddress,
        ownerWallet: app.ownerWallet,
        geohash: app.geohash,
        stickers: `${stickerStart}–${stickerStart + 19}`,
        status: "active",
      },
    ]);

    setPendingApps(pendingApps.filter((a) => a.id !== app.id));
    showToast(`Approved ${app.id} as ${newMinerId}`, "success");
  };

  const handleToggleSuspend = async (minerId: string) => {
    const miner = miners.find((m) => m.id === minerId);
    if (!miner || !currentWallet.privateKey) return;
    const makeActive = miner.status !== "active";
    const result = await setMinerActiveOnChain(currentWallet.privateKey, minerId, makeActive);
    if (!result.success) {
      showToast(result.error || "On-chain status update failed", "error");
      return;
    }
    setMiners(
      miners.map((m) =>
        m.id === minerId
          ? { ...m, status: m.status === "active" ? "suspended" : "active" }
          : m
      )
    );
    showToast(`Updated status for ${minerId}`, "info");
  };

  const handleSetObligation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWallet.privateKey) return;
    const result = await setObligationOnChain(
      currentWallet.privateKey, obligCompany, obligPeriod, obligAmount
    );
    showToast(
      result.success ? `Statutory quota set on-chain: ${obligAmount} AIR for ${obligPeriod}`
        : result.error || "On-chain obligation update failed",
      result.success ? "success" : "error"
    );
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* 4 Clean Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-[11px] font-mono uppercase text-zinc-400">Authority</div>
            <div className="font-medium text-sm text-zinc-100 mt-1">CPCB Regulatory Admin</div>
            <div className="text-[11px] text-zinc-400 font-mono mt-0.5">Fleet Oversight</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-[11px] font-mono uppercase text-zinc-400">Minted Supply</div>
            <div className="font-mono text-xl font-semibold text-zinc-100 mt-1">
              {networkTotals.minted} AIR
            </div>
            <div className="text-[11px] text-zinc-400 font-mono mt-0.5">Camera-Verified</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-[11px] font-mono uppercase text-zinc-400">Compliance Burns</div>
            <div className="font-mono text-xl font-semibold text-zinc-100 mt-1">
              {networkTotals.burned} AIR
            </div>
            <div className="text-[11px] text-zinc-400 font-mono mt-0.5">Retired by Industry</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-[11px] font-mono uppercase text-zinc-400">Monitored Fleet</div>
            <div className="font-mono text-xl font-semibold text-zinc-100 mt-1">
              {miners.length} Nodes
            </div>
            <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
              {pendingApps.length} pending review
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Applications Queue */}
      {pendingApps.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>
              <Landmark className="h-4 w-4 text-zinc-400" />
              <span>Pending Hardware Applications</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>App ID</TableHead>
                  <TableHead>Applicant Site</TableHead>
                  <TableHead>Owner Wallet</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingApps.map((app) => (
                  <TableRow key={app.id}>
                    <TableCell className="font-mono font-medium text-zinc-100">{app.id}</TableCell>
                    <TableCell className="text-zinc-200">{app.applicantName}</TableCell>
                    <TableCell className="font-mono text-[11px] text-zinc-400">
                      {app.ownerWallet.slice(0, 10)}...{app.ownerWallet.slice(-6)}
                    </TableCell>
                    <TableCell className="text-zinc-300 text-xs">{app.locationLabel}</TableCell>
                    <TableCell className="font-mono">{app.plantCount}</TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button size="sm" onClick={() => handleApproveApp(app)} className="h-6 px-2 text-[10px]">
                        Approve
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setPendingApps(pendingApps.filter((a) => a.id !== app.id))}
                        className="h-6 px-2 text-[10px]"
                      >
                        Reject
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Grid: Registered Fleet & Rejection Audit Log */}
      <div className="grid grid-cols-2 gap-6">
        {/* Fleet Management */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>
              <Layers className="h-4 w-4 text-zinc-400" />
              <span>Registered Fleet Nodes</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 pt-3">
            {miners.map((m) => (
              <div
                key={m.id}
                className="rounded border border-zinc-800 bg-zinc-950 p-3 text-xs font-mono space-y-1.5"
              >
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-zinc-100">{m.id}</span>
                    <Badge variant={m.status === "active" ? "emerald" : "destructive"}>
                      {m.status.toUpperCase()}
                    </Badge>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleToggleSuspend(m.id)}
                    className="h-6 px-2 text-[10px]"
                  >
                    {m.status === "active" ? "Suspend" : "Reactivate"}
                  </Button>
                </div>
                <div className="text-[11px] text-zinc-400 flex justify-between">
                  <span>Device: {m.deviceAddress.slice(0, 10)}...</span>
                  <span>Geohash: {m.geohash}</span>
                </div>
              </div>
            ))}

            {/* Set Obligation Mini-Form */}
            <form onSubmit={handleSetObligation} className="pt-3 border-t border-zinc-800/80 space-y-2">
              <div className="text-xs font-medium text-zinc-200">Set Statutory Quota</div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  placeholder="Period (e.g. 2026)"
                  value={obligPeriod}
                  onChange={(e) => setObligPeriod(e.target.value)}
                  required
                />
                <Input
                  placeholder="Quota in AIR"
                  value={obligAmount}
                  onChange={(e) => setObligAmount(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" variant="secondary" size="sm" className="w-full text-xs">
                Update Corporate Quota
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Attestation Rejection & Fraud Log */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>
              <ShieldAlert className="h-4 w-4 text-zinc-400" />
              <span>Validator Fraud Audit Log</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Miner</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rejections.map((r, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-zinc-100 font-medium">{r.miner_id}</TableCell>
                    <TableCell>
                      <Badge variant="destructive">{r.reason_code}</Badge>
                    </TableCell>
                    <TableCell className="text-[11px] text-zinc-300 truncate max-w-[180px]" title={r.reason}>
                      {r.reason}
                    </TableCell>
                    <TableCell className="text-right text-[10px] font-mono text-zinc-400">
                      {new Date(r.created_at).toLocaleTimeString()}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
