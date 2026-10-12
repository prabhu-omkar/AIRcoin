import React, { createContext, useContext, useState, useEffect } from "react";
import { DemoWallet } from "../types";
import { DEMO_WALLETS } from "../constants";
import { getBalances, claimFaucet as chainFaucet, checkRpcOnline } from "../services/chain";

interface WalletContextType {
  currentWallet: DemoWallet;
  switchWallet: (wallet: DemoWallet) => void;
  airBalance: string;
  tinrBalance: string;
  isRpcOnline: boolean;
  refreshBalances: () => Promise<void>;
  claimFreeFaucet: () => Promise<string | null>;
  adjustBalances: (deltaAir: number, deltaTinr: number) => void;
  toast: { message: string; type: "success" | "error" | "info" } | null;
  showToast: (message: string, type?: "success" | "error" | "info") => void;
}

const getDefaultBalancesForWallet = (wallet: DemoWallet) => {
  if (wallet.role === "citizen") {
    return { air: "2.7680", tinr: "1000.00" };
  } else if (wallet.role === "company") {
    return { air: "0.5000", tinr: "100000.00" };
  } else {
    return { air: "100.0000", tinr: "50000.00" };
  }
};

export const creditWalletBalance = (address: string, deltaAir: number, deltaTinr: number) => {
  const key = `aircoin.balance.${address.toLowerCase()}`;
  try {
    const stored = localStorage.getItem(key);
    const current = stored ? JSON.parse(stored) : { air: "0", tinr: "0" };
    const nextAir = Math.max(0, parseFloat(current.air || "0") + deltaAir).toFixed(4);
    const nextTinr = Math.max(0, parseFloat(current.tinr || "0") + deltaTinr).toFixed(2);
    localStorage.setItem(key, JSON.stringify({ air: nextAir, tinr: nextTinr }));
  } catch {}
};

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentWallet, setCurrentWallet] = useState<DemoWallet>(DEMO_WALLETS[0]);
  const [airBalance, setAirBalance] = useState<string>("2.7680");
  const [tinrBalance, setTinrBalance] = useState<string>("1000.00");
  const [isRpcOnline, setIsRpcOnline] = useState<boolean>(false);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const showToast = (message: string, type: "success" | "error" | "info" = "info") => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4500);
  };

  const adjustBalances = (deltaAir: number, deltaTinr: number) => {
    const key = `aircoin.balance.${currentWallet.address.toLowerCase()}`;
    const nextAir = Math.max(0, parseFloat(airBalance) + deltaAir).toFixed(4);
    const nextTinr = Math.max(0, parseFloat(tinrBalance) + deltaTinr).toFixed(2);
    try {
      localStorage.setItem(key, JSON.stringify({ air: nextAir, tinr: nextTinr }));
    } catch {}
    setAirBalance(nextAir);
    setTinrBalance(nextTinr);
  };

  const refreshBalances = async () => {
    const key = `aircoin.balance.${currentWallet.address.toLowerCase()}`;
    const defaults = getDefaultBalancesForWallet(currentWallet);
    let localVal = defaults;
    try {
      const stored = localStorage.getItem(key);
      if (stored) {
        localVal = JSON.parse(stored);
      } else {
        localStorage.setItem(key, JSON.stringify(defaults));
      }
    } catch {}

    const online = await checkRpcOnline();
    setIsRpcOnline(online);

    if (online) {
      const res = await getBalances(currentWallet.address);
      if (res) {
        const onChainAir = parseFloat(res.air);
        const onChainTinr = parseFloat(res.tinr);
        const effectiveAir = Math.max(onChainAir, parseFloat(localVal.air || "0")).toFixed(4);
        const effectiveTinr = Math.max(onChainTinr, parseFloat(localVal.tinr || "0")).toFixed(2);
        setAirBalance(effectiveAir);
        setTinrBalance(effectiveTinr);
        try {
          localStorage.setItem(key, JSON.stringify({ air: effectiveAir, tinr: effectiveTinr }));
        } catch {}
        return;
      }
    }

    setAirBalance(parseFloat(localVal.air).toFixed(4));
    setTinrBalance(parseFloat(localVal.tinr).toFixed(2));
  };

  useEffect(() => {
    refreshBalances();
    const interval = setInterval(refreshBalances, 10000);
    return () => clearInterval(interval);
  }, [currentWallet]);

  const switchWallet = (wallet: DemoWallet) => {
    setCurrentWallet(wallet);
  };

  const claimFreeFaucet = async (): Promise<string | null> => {
    adjustBalances(0, 10000);

    if (currentWallet.privateKey && isRpcOnline) {
      showToast("Requesting 10,000 tINR faucet on-chain...", "info");
      const res = await chainFaucet(currentWallet.privateKey);
      if (res.success && res.txHash) {
        showToast("Claimed 10,000 tINR from faucet!", "success");
        await refreshBalances();
        return res.txHash;
      }
    }

    showToast("Added 10,000 tINR to wallet balance", "success");
    return "0x" + Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  };

  return (
    <WalletContext.Provider
      value={{
        currentWallet,
        switchWallet,
        airBalance,
        tinrBalance,
        isRpcOnline,
        refreshBalances,
        claimFreeFaucet,
        adjustBalances,
        toast,
        showToast,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used within WalletProvider");
  return context;
};
