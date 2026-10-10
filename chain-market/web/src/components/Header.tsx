import React, { useState } from "react";
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

  const [copied, setCopied] = useState<boolean>(false);
  const [dropdownOpen, setDropdownOpen] = useState<boolean>(false);
  const [isFauceting, setIsFauceting] = useState<boolean>(false);


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
    <header className="sticky top-0 z-40 w-full border-b border-border bg-card/95 px-6 py-3 backdrop-blur">
      <div className="flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded border border-border bg-card">
              <Wind className="h-3.5 w-3.5 text-foreground" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold tracking-tight text-foreground">AIRcoin</span>
              </div>
            </div>
          </div>

        </div>

        {/* Balances & Persona */}
        <div className="flex items-center gap-3">
          {/* Token Balances */}
          <div className="flex items-center gap-3 rounded border border-border bg-card px-3 py-1 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-mono text-muted-foreground">AIR</span>
              <span className="font-mono font-medium text-foreground">{airBalance}</span>
            </div>

            <span className="text-muted-foreground/70">•</span>

            <div className="flex items-center gap-1.5">
              <span className="text-[10px] uppercase font-mono text-muted-foreground">tINR</span>
              <span className="font-mono font-medium text-foreground">₹{tinrBalance}</span>
            </div>

            <button
              onClick={() => refreshBalances()}
              title="Refresh"
              className="text-muted-foreground hover:text-foreground ml-1"
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
            className="text-xs gap-1 border-border hover:bg-muted"
          >
            <Plus className="h-3 w-3 text-muted-foreground" />
            {isFauceting ? "Claiming..." : "Faucet ₹10k"}
          </Button>

          {/* Persona Switcher */}
          <div className="relative">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="gap-2 border border-border bg-muted hover:bg-muted"
            >
              <div className="text-left">
                <span className="font-medium text-foreground">{currentWallet.name}</span>
                <span className="ml-1.5 text-[10px] text-muted-foreground uppercase font-mono">
                  ({currentWallet.role})
                </span>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>

            {dropdownOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-72 rounded-lg border border-border bg-card p-2 shadow-lg z-50">
                <div className="px-2 py-1 text-[10px] uppercase tracking-wider font-mono text-muted-foreground border-b border-border mb-1">
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
                        ? "bg-muted border border-border text-foreground"
                        : "hover:bg-muted text-foreground/80"
                    }`}
                  >
                    <div className="flex justify-between items-center">
                      <span className="font-medium">{wallet.name}</span>
                      <Badge variant="outline" className="text-[9px] uppercase border-border">
                        {wallet.role}
                      </Badge>
                    </div>
                    <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
                      {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                    </div>
                  </div>
                ))}

                <div className="mt-2 pt-2 border-t border-border flex items-center justify-between px-2">
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {isRpcOnline ? "Hardhat #31337" : "Local Mode"}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleCopy}
                    className="h-6 px-2 text-[10px]"
                  >
                    {copied ? <Check className="h-3 w-3 mr-1 text-emerald-600" /> : <Copy className="h-3 w-3 mr-1" />}
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
