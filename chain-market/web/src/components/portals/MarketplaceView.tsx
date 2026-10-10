import React, { useState, useEffect } from "react";
import { useWallet } from "../../context/WalletContext";
import { fetchListings, fetchTrades } from "../../services/api";
import { buyListing, listAirOnMarket } from "../../services/chain";
import { MarketplaceListing, TradeItem } from "../../types";
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
import { ShoppingBag, Plus, ArrowDownUp } from "lucide-react";

export const MarketplaceView: React.FC = () => {
  const { currentWallet, airBalance, tinrBalance, refreshBalances, showToast } = useWallet();

  const [listings, setListings] = useState<MarketplaceListing[]>([
    {
      id: 1,
      seller: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
      amount_air: "1000000000000000000",
      price_tinr: "500000000000000000000",
      status: "active",
      created_at: Date.now() - 3600000,
    },
    {
      id: 2,
      seller: "0x90f79bf6eb2c4f870365e785982e1f101e93b906",
      amount_air: "2000000000000000000",
      price_tinr: "950000000000000000000",
      status: "active",
      created_at: Date.now() - 7200000,
    },
  ]);

  const [trades, setTrades] = useState<TradeItem[]>([
    {
      id: 1,
      listing_id: 0,
      seller: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
      buyer: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
      amount_air: "1500000000000000000",
      price_tinr: "750000000000000000000",
      tx_hash: "0x4b78912c0192e847b019c0192e847b019c0192e847b019c0192e847b019c0192",
      block_number: 18230,
      ts: Date.now() - 14400000,
    },
  ]);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newAirAmount, setNewAirAmount] = useState("1.0");
  const [newPriceTinr, setNewPriceTinr] = useState("500");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [buyingId, setBuyingId] = useState<number | null>(null);

  useEffect(() => {
    async function loadData() {
      const listData = await fetchListings();
      if (listData && listData.length > 0) setListings(listData);
      const tradeData = await fetchTrades();
      if (tradeData && tradeData.length > 0) setTrades(tradeData);
    }
    loadData();
  }, []);

  const handleBuy = async (listing: MarketplaceListing) => {
    if (!currentWallet.privateKey) {
      showToast("Private key required", "error");
      return;
    }

    const priceNum = parseFloat(listing.price_tinr) / 1e18;
    if (parseFloat(tinrBalance) < priceNum) {
      showToast(`Insufficient balance (Requires ₹${priceNum}). Use faucet.`, "error");
      return;
    }

    setBuyingId(listing.id);
    const res = await buyListing(currentWallet.privateKey, listing.id, priceNum.toString());
    setBuyingId(null);

    if (res.success && res.txHash) {
      showToast(`Purchased Listing #${listing.id}`, "success");
      setListings(listings.filter((l) => l.id !== listing.id));
      await refreshBalances();
    } else {
      showToast(res.error || "Purchase failed", "error");
    }
  };

  const handleCreateListing = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentWallet.privateKey) {
      showToast("Private key required", "error");
      return;
    }
    setIsSubmitting(true);
    const res = await listAirOnMarket(currentWallet.privateKey, newAirAmount, newPriceTinr);
    setIsSubmitting(false);

    if (res.success && res.txHash) {
      showToast(`Listing created: ${newAirAmount} AIR for ₹${newPriceTinr}`, "success");
      setShowCreateModal(false);
      await refreshBalances();
    } else {
      showToast(res.error || "Failed to list", "error");
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      {/* 4 Clean Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="text-[11px] font-mono uppercase text-zinc-400">Active Orders</div>
            <div className="font-mono text-xl font-semibold text-zinc-100 mt-1">
              {listings.filter((l) => l.status === "active").length} Orders
            </div>
            <div className="text-[11px] text-zinc-400 font-mono mt-0.5">Escrowed by Contract</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-[11px] font-mono uppercase text-zinc-400">Reference Rate</div>
            <div className="font-mono text-xl font-semibold text-zinc-100 mt-1">
              ₹500.00 / AIR
            </div>
            <div className="text-[11px] text-zinc-400 font-mono mt-0.5">1 AIR = 1 mg PM2.5-eq</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-[11px] font-mono uppercase text-zinc-400">Available AIR</div>
            <div className="font-mono text-xl font-semibold text-zinc-100 mt-1">
              {airBalance} AIR
            </div>
            <div className="text-[11px] text-zinc-400 font-mono mt-0.5">Wallet Holding</div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="text-[11px] font-mono uppercase text-zinc-400">Available tINR</div>
            <div className="font-mono text-xl font-semibold text-zinc-100 mt-1">
              ₹{tinrBalance}
            </div>
            <div className="text-[11px] text-zinc-400 font-mono mt-0.5">Treasury Holding</div>
          </CardContent>
        </Card>
      </div>

      {/* Spot Order Book Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <CardTitle>
            <ShoppingBag className="h-4 w-4 text-zinc-400" />
            <span>Spot Order Book</span>
          </CardTitle>
          <Button size="sm" onClick={() => setShowCreateModal(true)} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Create Sell Order
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order</TableHead>
                <TableHead>Seller</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Total Price</TableHead>
                <TableHead>Unit Rate</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {listings.map((l) => {
                const airAmount = parseFloat(l.amount_air) / 1e18;
                const tinrPrice = parseFloat(l.price_tinr) / 1e18;
                const unitPrice = (tinrPrice / airAmount).toFixed(2);
                const isMyListing = l.seller.toLowerCase() === currentWallet.address.toLowerCase();

                return (
                  <TableRow key={l.id}>
                    <TableCell className="font-mono font-medium text-zinc-100">#{l.id}</TableCell>
                    <TableCell className="font-mono text-[11px] text-zinc-400">
                      {l.seller.slice(0, 8)}...{l.seller.slice(-6)} {isMyListing && "(You)"}
                    </TableCell>
                    <TableCell className="font-mono text-zinc-100 font-medium">
                      {airAmount.toFixed(4)} AIR
                    </TableCell>
                    <TableCell className="font-mono text-zinc-100">
                      ₹{tinrPrice.toFixed(2)}
                    </TableCell>
                    <TableCell className="font-mono text-zinc-400 text-[11px]">
                      ₹{unitPrice} / AIR
                    </TableCell>
                    <TableCell className="text-right">
                      {isMyListing ? (
                        <Badge variant="outline" className="text-[10px]">OWN ORDER</Badge>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleBuy(l)}
                          disabled={buyingId === l.id}
                          className="h-6 px-2.5 text-[11px]"
                        >
                          {buyingId === l.id ? "Buying..." : `Buy for ₹${tinrPrice.toFixed(0)}`}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Recent Executed Trades */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle>
            <ArrowDownUp className="h-4 w-4 text-zinc-400" />
            <span>Settlement Ledger</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Seller</TableHead>
                <TableHead>Buyer</TableHead>
                <TableHead>Volume</TableHead>
                <TableHead>Total Paid</TableHead>
                <TableHead>Transaction</TableHead>
                <TableHead className="text-right">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {trades.map((t, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-mono text-[11px] text-zinc-400">
                    {t.seller.slice(0, 8)}...{t.seller.slice(-4)}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-zinc-400">
                    {t.buyer.slice(0, 8)}...{t.buyer.slice(-4)}
                  </TableCell>
                  <TableCell className="font-mono text-zinc-100 font-medium">
                    {(parseFloat(t.amount_air) / 1e18).toFixed(4)} AIR
                  </TableCell>
                  <TableCell className="font-mono text-zinc-100">
                    ₹{(parseFloat(t.price_tinr) / 1e18).toFixed(2)}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] text-zinc-400">
                    {t.tx_hash.slice(0, 10)}...{t.tx_hash.slice(-6)}
                  </TableCell>
                  <TableCell className="text-right text-[11px] text-zinc-400">
                    {new Date(t.ts).toLocaleTimeString()}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Dialog: Create Order */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent onClose={() => setShowCreateModal(false)}>
          <DialogHeader>
            <DialogTitle>Create Sell Order</DialogTitle>
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
                value={newAirAmount}
                onChange={(e) => setNewAirAmount(e.target.value)}
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
                value={newPriceTinr}
                onChange={(e) => setNewPriceTinr(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting}>
                {isSubmitting ? "Locking..." : "Deposit to Escrow & List"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};
