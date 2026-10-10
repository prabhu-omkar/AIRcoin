import React, { useState, useEffect } from "react";
import { useWallet } from "../context/WalletContext";
import { DEMO_WALLETS } from "../constants";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";
import { Wind, RefreshCw, Copy, Check, ChevronDown, Plus } from "lucide-react";

export const Header: React.FC = () => {
  const {
    currentWallet,
    switchWallet,
    airBalance,
    tinrBalance,
    isRpcOnline,
    refreshBalances,
    claimFreeFaucet,
    showToast,
  } = useWallet();

  const [epochSecRemaining, setEpochSecRemaining] = useState<number>(45);
  const [currentEpoch, setCurrentEpoch] = useState<number>(29863320);
  const [copied, setCopied] = useState<boolean>(false);
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);
  const [isFauceting, setIsFauceting] = useState<boolean>(false);

  useEffect(() => {
    const timer = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = 60 - (now % 60);
      setEpochSecRemaining(remaining);
      setCurrentEpoch(Math.floor(now / 60));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(currentWallet.address);
    setCopied(true);
    showToast("Address copied to clipboard", "info");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFaucet = async () => {
    setIsFauceting(true);
    await claimFreeFaucet();
    setIsFauceting(false);
  };

  return (
    <header className="sticky top-0 z-40 w-full border-b border-zinc-800 bg-black px-6 py-2.5">
      <div className="flex items-center justify-between">
        {/* Brand & Epoch Ticker */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded border border-zinc-800 bg-zinc-950">
              <Wind className="h-3.5 w-3.5 text-zinc-100" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tracking-tight text-zinc-100">AIRcoin</span>
                <Badge variant="outline" className="text-[9px] py-0 px-1.5 border-zinc-800">
                  PROTOCOL v1
                </Badge>
              </div>
            </div>
          </div>

          <div className="h-4 w-px bg-zinc-800" />

          {/* Epoch Countdown */}
          <div className="flex items-center gap-2 rounded border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-xs font-mono">
            <div
              className={`h-1.5 w-1.5 rounded-full ${
                epochSecRemaining <= 10 ? "bg-amber-400" : "bg-emerald-400"
              }`}
            />
            <span className="text-zinc-400">EPOCH #{currentEpoch}</span>
            <span className="text-zinc-600">/</span>
            <span
              className={
                epochSecRemaining <= 10
                  ? "font-semibold text-amber-400"
                  : "font-semibold text-zinc-200"
              }
            >
              {epochSecRemaining}s
            </span>
          </div>
        </div>

        {/* Balances & Persona */}
        <div className="flex items-center gap-3">
          {/* Token Balances */}
          <div className="flex items-center gap-3 rounded border border-zinc-800 bg-zinc-950 px-3 py-1 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-mono text-zinc-400">AIR</span>
              <span className="font-mono font-medium text-zinc-100">{airBalance}</span>
            </div>

            <span className="text-zinc-700">•</span>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-mono text-zinc-400">tINR</span>
              <span className="font-mono font-medium text-zinc-100">₹{tinrBalance}</span>
            </div>

            <button
              onClick={() => refreshBalances()}
              title="Refresh"
              className="text-zinc-500 hover:text-zinc-300 ml-1"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>

          {/* Faucet Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleFaucet}
            disabled={isFauceting}
            className="text-xs gap-1 border-zinc-800 hover:bg-zinc-900"
          >
            <Plus className="h-3 w-3 text-zinc-400" />
            {isFauceting ? "Claiming..." : "Faucet ₹10k"}
          </Button>

          {/* Persona Switcher */}
          <div className="relative">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="gap-2 border border-zinc-800 bg-zinc-900 hover:bg-zinc-850"
            >
              <div className="text-left">
                <span className="font-medium text-zinc-200">{currentWallet.name}</span>
                <span className="ml-1.5 text-[10px] text-zinc-400 uppercase font-mono">
                  ({currentWallet.role})
                </span>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-zinc-500" />
            </Button>

            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-72 rounded-lg border border-zinc-800 bg-[#09090b] p-2 shadow-2xl z-50">
                <div className="px-2 py-1 text-[10px] uppercase tracking-wider font-mono text-zinc-400 border-b border-zinc-850 mb-1">
                  Active Persona
                </div>

                {DEMO_WALLETS.map((wallet) => (
                  <div
                    key={wallet.address}
                    onClick={() => {
                      switchWallet(wallet);
                      setDropdownOpen(false);
                    }}
                    className={`cursor-pointer rounded p-2 text-xs transition-colors ${
                      currentWallet.address === wallet.address
                        ? "bg-zinc-900 border border-zinc-800 text-zinc-100"
                        : "hover:bg-zinc-900/60 text-zinc-300"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{wallet.name}</span>
                      <Badge variant="outline" className="text-[9px] uppercase border-zinc-800">
                        {wallet.role}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-zinc-400 font-mono mt-0.5">
                      {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                    </div>
                  </div>
                ))}

                <div className="mt-2 pt-2 border-t border-zinc-850 flex items-center justify-between px-2">
                  <span className="text-[10px] text-zinc-400 font-mono">
                    {isRpcOnline ? "Hardhat #31337" : "Local Mode"}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="h-6 px-2 text-[10px]"
                  >
                    {copied ? <Check className="h-3 w-3 mr-1 text-emerald-400" /> : <Copy className="h-3 w-3 mr-1" />}
                    Copy Address
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
