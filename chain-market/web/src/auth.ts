// Demo sign-in for the local chain: each account maps to a funded Hardhat wallet.
import { DEMO_WALLETS } from "./constants";
import type { DemoWallet } from "./types";

export interface Account {
  email: string;
  name: string;
  wallet: DemoWallet;
}

const NO_MINER: DemoWallet = {
  address: "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
  name: "Meera Iyer",
  role: "citizen",
  description: "No miner yet",
  privateKey: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
};

const byRole = (role: DemoWallet["role"], minerId?: string) =>
  DEMO_WALLETS.find((w) => w.role === role && (minerId === undefined || w.minerId === minerId))!;

export const DEMO_PASSWORD = "aircoin";

export const ACCOUNTS: Account[] = [
  { email: "alice@aircoin.in", name: "Alice Fernandes", wallet: byRole("citizen", "miner-001") },
  { email: "rohan@aircoin.in", name: "Rohan Kulkarni", wallet: byRole("citizen", "miner-002") },
  { email: "meera@aircoin.in", name: "Meera Iyer", wallet: NO_MINER },
  { email: "compliance@apexsteel.in", name: "Apex Steel Works", wallet: byRole("company") },
];

const KEY = "aircoin.session";

export function signIn(email: string, password: string): Account | null {
  const acc = ACCOUNTS.find((a) => a.email === email.trim().toLowerCase());
  if (!acc || password !== DEMO_PASSWORD) return null;
  sessionStorage.setItem(KEY, acc.email);
  return acc;
}

export function currentAccount(): Account | null {
  const email = sessionStorage.getItem(KEY);
  return ACCOUNTS.find((a) => a.email === email) ?? null;
}

export function signOut() {
  sessionStorage.removeItem(KEY);
}
