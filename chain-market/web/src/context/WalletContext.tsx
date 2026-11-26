import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { ethers } from "ethers";
import { DemoWallet } from "../types";
import { DEMO_WALLETS } from "../constants";
import { fetchAccount, fetchStatus } from "../services/api";
import { claimFaucet } from "../services/chain";

interface WalletContextType {
  currentWallet: DemoWallet;
  switchWallet: (wallet: DemoWallet) => void;
  /** AIR and tINR as display strings, straight from the chain. */
  airBalance: string;
  tinrBalance: string;
  isChainOnline: boolean;
  blockHeight: number;
  refreshBalances: () => Promise<void>;
  claimFreeFaucet: () => Promise<string | null>;
  toast: { message: string; type: "success" | "error" | "info" } | null;
  showToast: (message: string, type?: "success" | "error" | "info") => void;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: React.ReactNode; initial?: DemoWallet }> = ({ children, initial }) => {
  const [currentWallet, setCurrentWallet] = useState<DemoWallet>(initial ?? DEMO_WALLETS[0]);
  const [airBalance, setAirBalance] = useState("0.0000");
  const [tinrBalance, setTinrBalance] = useState("0.00");
  const [isChainOnline, setIsChainOnline] = useState(false);
  const [blockHeight, setBlockHeight] = useState(0);
  const [toast, setToast] = useState<WalletContextType["toast"]>(null);

  const showToast = (message: string, type: "success" | "error" | "info" = "info") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  const refreshBalances = useCallback(async () => {
    const [status, acct] = await Promise.all([fetchStatus(), fetchAccount(currentWallet.address)]);
    setIsChainOnline(Boolean(status));
    if (status) setBlockHeight(status.height);
    if (acct) {
      setAirBalance(Number(ethers.formatEther(acct.air)).toFixed(4));
      setTinrBalance(Number(ethers.formatEther(acct.tinr)).toFixed(2));
    }
  }, [currentWallet.address]);

  useEffect(() => {
    refreshBalances();
    const t = setInterval(refreshBalances, 3000); // ~3 blocks
    return () => clearInterval(t);
  }, [refreshBalances]);

  const claimFreeFaucet = async (): Promise<string | null> => {
    showToast("Requesting 1,000 tINR from the faucet…", "info");
    const res = await claimFaucet(currentWallet);
    if (res.success) {
      showToast("Received 1,000 tINR", "success");
      await refreshBalances();
      return res.txHash ?? null;
    }
    showToast(`Faucet failed: ${res.error}`, "error");
    return null;
  };

  return (
    <WalletContext.Provider
      value={{
        currentWallet,
        switchWallet: setCurrentWallet,
        airBalance,
        tinrBalance,
        isChainOnline,
        blockHeight,
        refreshBalances,
        claimFreeFaucet,
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
