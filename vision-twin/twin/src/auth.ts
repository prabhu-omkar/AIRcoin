// Demo sign-in for the owner dashboard, same accounts as the chain-market platform.
export interface Owner {
  email: string;
  name: string;
  minerId?: string;
}

export const DEMO_PASSWORD = "aircoin";
export const OWNERS: Owner[] = [
  { email: "alice@aircoin.in", name: "Alice Fernandes", minerId: "miner-001" },
  { email: "rohan@aircoin.in", name: "Rohan Kulkarni", minerId: "miner-002" },
  { email: "meera@aircoin.in", name: "Meera Iyer" },
];

const KEY = "aircoin.owner";

export function signIn(email: string, password: string): Owner | null {
  const o = OWNERS.find((x) => x.email === email.trim().toLowerCase());
  if (!o || password !== DEMO_PASSWORD) return null;
  sessionStorage.setItem(KEY, o.email);
  return o;
}

export const currentOwner = () => OWNERS.find((o) => o.email === sessionStorage.getItem(KEY)) ?? null;
export const signOut = () => sessionStorage.removeItem(KEY);
