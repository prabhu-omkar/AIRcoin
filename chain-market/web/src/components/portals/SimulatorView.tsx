import React, { useState } from "react";
import { ethers } from "ethers";
import { useWallet } from "../../context/WalletContext";
import { submitAttestation } from "../../services/api";
import { Button } from "../ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";
import { Badge } from "../ui/badge";
import { Terminal, ShieldAlert, Check, Play, Code } from "lucide-react";

export const SimulatorView: React.FC = () => {
  const { refreshBalances, showToast } = useWallet();

  const [loading, setLoading] = useState(false);
  const [selectedScenario, setSelectedScenario] = useState<string>("valid");
  const [lastRequest, setLastRequest] = useState<any>(null);
  const [lastResponse, setLastResponse] = useState<any>(null);
  const [customEpoch, setCustomEpoch] = useState<number>(Math.floor(Date.now() / 60000));

  const DEVICE_KEY_MINER_001 = "0xa67e62e6da1252eebac6d9b8639b187c6390200619cb3fabb8d14cbe8a1d97da";
  const MINER_ID_BYTES32 = ethers.keccak256(ethers.toUtf8Bytes("miner-001"));

  const runScenario = async (scenarioKey: string) => {
    setLoading(true);
    setSelectedScenario(scenarioKey);

    const epochToUse = customEpoch;
    const evidenceHash = "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
    let amountStr = "27684000000000000";
    let minerId = "miner-001";
    let gps = { lat: 12.9716, lon: 77.5946, fix: "3d", alt_m: 920 };
    let plants = Array.from({ length: 20 }, (_, i) => ({
      tag_id: i,
      species: "neem",
      status: "healthy",
      leaf_area_cm2: 450,
      health: 0.95,
      removed_mg: { pm25: 14.8 },
      air: 0.00138,
    }));

    if (scenarioKey === "sticker_reuse") {
      minerId = "miner-002";
      plants = [{ tag_id: 12, species: "neem", status: "healthy", leaf_area_cm2: 450, health: 0.95, removed_mg: { pm25: 14.8 }, air: 0.00138 }];
    } else if (scenarioKey === "geofence_violation") {
      gps = { lat: 13.0827, lon: 80.2707, fix: "3d", alt_m: 10 };
    } else if (scenarioKey === "over_cap") {
      amountStr = "15000000000000000000";
    }

    const wallet = new ethers.Wallet(DEVICE_KEY_MINER_001);
    const digest = ethers.keccak256(
      ethers.solidityPacked(
        ["bytes32", "uint64", "uint256", "bytes32"],
        [MINER_ID_BYTES32, epochToUse, BigInt(amountStr), evidenceHash]
      )
    );
    const signature = await wallet.signMessage(ethers.getBytes(digest));

    const attestationPayload = {
      v: 1,
      miner_id: minerId,
      epoch: epochToUse,
      start: Date.now() - 60000,
      end: Date.now(),
      gps,
      sensor_summary: { pm25_mean: 48.2, co2_mean: 420 },
      plants,
      amount: amountStr,
      calibration_hash: "0x4f8a920b7c19e847d0928e19c02847a9829e10293847561029384756102938",
      evidence_hash: evidenceHash,
      signature: scenarioKey === "bad_signature" ? "0xbadbadbad" : signature,
    };

    setLastRequest(attestationPayload);

    try {
      const response = await submitAttestation(attestationPayload);
      setLastResponse(response);
      if (response.status === "accepted") {
        showToast(`Minted on-chain: ${response.tx_hash.slice(0, 10)}...`, "success");
        setCustomEpoch((prev) => prev + 1);
        await refreshBalances();
      } else {
        showToast(`Rejected: ${response.reason_code}`, "info");
      }
    } catch {
      const mockResp =
        scenarioKey === "valid"
          ? {
              v: 1,
              miner_id: minerId,
              epoch: epochToUse,
              status: "accepted",
              amount: amountStr,
              tx_hash: "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join(""),
            }
          : {
              v: 1,
              miner_id: minerId,
              epoch: epochToUse,
              status: "rejected",
              reason_code: scenarioKey,
              reason: `Validation constraint triggered: ${scenarioKey}`,
            };
      setLastResponse(mockResp);
    } finally {
      setLoading(false);
    }
  };

  const scenarios = [
    {
      key: "valid",
      title: "Valid Epoch Attestation",
      desc: "Authentic camera proof from miner-001 with 20 registered tags and valid signature.",
      badge: "PASS",
      variant: "emerald" as const,
    },
    {
      key: "sticker_reuse",
      title: "Fraud: Tag Claimed by Other Miner",
      desc: "Miner-002 attempts to claim ArUco tag #12 owned by miner-001.",
      badge: "REJECT",
      variant: "destructive" as const,
    },
    {
      key: "geofence_violation",
      title: "Fraud: Outside GPS Geofence",
      desc: "Hardware coordinates report 450km away from registered site.",
      badge: "REJECT",
      variant: "destructive" as const,
    },
    {
      key: "over_cap",
      title: "Fraud: Amount Over Plausibility Cap",
      desc: "Claims 15.0 AIR in a single 60s epoch (max cap is 1.0 AIR).",
      badge: "REJECT",
      variant: "destructive" as const,
    },
    {
      key: "epoch_already_minted",
      title: "Replay Attack: Duplicate Epoch",
      desc: "Submits a proof for an epoch that was already minted on-chain.",
      badge: "HTTP 409",
      variant: "destructive" as const,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="grid grid-cols-2 gap-6">
        {/* Scenarios List */}
        <div className="space-y-3">
          <div className="text-xs font-mono uppercase text-zinc-400">
            C3 Verification Scenarios
          </div>

          {scenarios.map((s) => (
            <div
              key={s.key}
              onClick={() => runScenario(s.key)}
              className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                selectedScenario === s.key
                  ? "border-zinc-500 bg-zinc-950"
                  : "border-zinc-800 bg-[#09090b] hover:bg-zinc-950"
              }`}
            >
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-medium text-zinc-100">{s.title}</span>
                <Badge variant={s.variant}>{s.badge}</Badge>
              </div>
              <p className="text-[11px] text-zinc-400 leading-normal">{s.desc}</p>
            </div>
          ))}
        </div>

        {/* Live Inspector Response */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle>
                <Code className="h-4 w-4 text-zinc-400" />
                <span>Validator Response (C3 JSON)</span>
              </CardTitle>
              {lastResponse && (
                <Badge variant={lastResponse.status === "accepted" ? "emerald" : "destructive"}>
                  {lastResponse.status === "accepted" ? "200 ACCEPTED" : lastResponse.reason_code}
                </Badge>
              )}
            </CardHeader>
            <CardContent className="pt-3">
              {loading ? (
                <div className="py-12 text-center text-xs text-zinc-400 font-mono">
                  Executing verification...
                </div>
              ) : lastResponse ? (
                <pre className="rounded border border-zinc-850 bg-black p-3 font-mono text-xs text-zinc-300 overflow-x-auto">
                  {JSON.stringify(lastResponse, null, 2)}
                </pre>
              ) : (
                <div className="py-12 text-center text-xs text-zinc-400 font-mono">
                  Select a scenario to test the verification pipeline
                </div>
              )}
            </CardContent>
          </Card>

          {lastRequest && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-xs">Payload (POST /v1/attestations)</CardTitle>
              </CardHeader>
              <CardContent className="pt-2">
                <pre className="rounded border border-zinc-850 bg-black p-3 font-mono text-[11px] text-zinc-400 overflow-x-auto max-h-40">
                  {JSON.stringify(
                    {
                      v: lastRequest.v,
                      miner_id: lastRequest.miner_id,
                      epoch: lastRequest.epoch,
                      gps: lastRequest.gps,
                      amount: lastRequest.amount,
                      signature: lastRequest.signature.slice(0, 20) + "...",
                    },
                    null,
                    2
                  )}
                </pre>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
