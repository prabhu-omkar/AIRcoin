// Connect MetaMask (or any EIP-1193 wallet). The AIRcoin chain needs no RPC network, no
// gas and no chain switch: MetaMask only signs, with personal_sign, and the app sends the
// signed transaction to an AIRcoin node.
import type { DemoWallet } from "../types";
import { fetchAccount, fetchObligations } from "./api";

type Eip1193 = {
  request(args: { method: string; params?: unknown[] }): Promise<any>;
  on?(event: string, cb: (...a: any[]) => void): void;
  removeListener?(event: string, cb: (...a: any[]) => void): void;
  isMetaMask?: boolean;
};

export const ethereum = (): Eip1193 | undefined => (window as any).ethereum;
export const hasMetaMask = () => Boolean(ethereum());

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** Ask the extension for an account and work out who it is from chain state. */
export async function connectMetaMask(): Promise<DemoWallet> {
  const eth = ethereum();
  if (!eth) throw new Error("MetaMask is not installed in this browser.");
  const [address] = (await eth.request({ method: "eth_requestAccounts" })) as string[];
  if (!address) throw new Error("No account was shared.");
  return walletFor(address.toLowerCase());
}

export async function walletFor(address: string): Promise<DemoWallet> {
  const [acct, obligations] = await Promise.all([fetchAccount(address), fetchObligations()]);
  const base = { address, source: "metamask" as const };
  if (acct?.is_admin) return { ...base, role: "admin", name: "Regulator", description: "MetaMask · regulator key" };
  const ob = obligations.find((o) => o.company === address);
  if (ob) {
    return { ...base, role: "company", name: ob.company_name, companyName: ob.company_name, description: "MetaMask · compliance buyer" };
  }
  const minerId = acct?.miners?.[0];
  return {
    ...base,
    role: "citizen",
    name: short(address),
    minerId,
    description: minerId ? `MetaMask · ${minerId} owner` : "MetaMask · citizen",
  };
}

/** Calls back with the new account (or null) when the user switches or disconnects in MetaMask. */
export function onAccountChange(cb: (address: string | null) => void): () => void {
  const eth = ethereum();
  if (!eth?.on) return () => {};
  const handler = (accounts: string[]) => cb(accounts[0]?.toLowerCase() ?? null);
  eth.on("accountsChanged", handler);
  return () => eth.removeListener?.("accountsChanged", handler);
}
