import React, { useState, useEffect, useRef } from "react";
import { Activity, Trash2, ArrowUpRight } from "lucide-react";
import { Button } from "../ui/button";
import { Badge } from "../ui/badge";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";

export interface StreamEvent {
  id: string;
  v: number;
  type: "mint" | "trade" | "burn" | "transfer";
  tx_hash: string;
  block_number: number;
  ts: number;
  data: any;
}

export const EventStream: React.FC = () => {
  const [events, setEvents] = useState<StreamEvent[]>([
    {
      id: "evt-1",
      v: 1,
      type: "mint",
      tx_hash: "0x8c3d5d3849fd472bb70e93be08d4cc384e91e0c3186d1c78ea82a174479eeaf0",
      block_number: 18234,
      ts: Date.now() - 45000,
      data: {
        miner_id: "miner-001",
        epoch: 29863320,
        to: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
        amount: "27684000000000000",
      },
    },
    {
      id: "evt-2",
      v: 1,
      type: "trade",
      tx_hash: "0x4b78912c0192e847b019c0192e847b019c0192e847b019c0192e847b019c0192",
      block_number: 18233,
      ts: Date.now() - 90000,
      data: {
        listing_id: 1,
        seller: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8",
        buyer: "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc",
        amount_air: "1500000000000000000",
        price_tinr: "750000000000000000000",
      },
    },
    {
      id: "evt-3",
      v: 1,
      type: "burn",
      tx_hash: "0x7892af09b83c19e847d0928e19c02847a9829e10293847561029384756102938",
      block_number: 18232,
      ts: Date.now() - 140000,
      data: {
        company: "0x3c44cdddb6a900fa2b585dd299e03d12FA4293BC",
        period: "2026",
        amount: "1500000000000000000",
      },
    },
  ]);

  const [connected, setConnected] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const wsUrl = "ws://localhost:3002/v1/events";
    let ws: WebSocket;

    try {
      ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      ws.onopen = () => setConnected(true);
      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          const streamEvt: StreamEvent = {
            id: `evt-${Date.now()}-${Math.random()}`,
            ...parsed,
          };
          setEvents((prev) => [streamEvt, ...prev].slice(0, 100));
        } catch {}
      };
      ws.onclose = () => setConnected(false);
      ws.onerror = () => setConnected(false);
    } catch {
      setConnected(false);
    }

    return () => {
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  const filteredEvents =
    filterType === "all" ? events : events.filter((e) => e.type === filterType);

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      {/* Top Filter Bar */}
      <Card>
        <CardContent className="p-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs font-mono">
              <div
                className={`h-2 w-2 rounded-full ${
                  connected ? "bg-emerald-400" : "bg-zinc-600"
                }`}
              />
              <span className="text-zinc-400">
                {connected ? "WS CONNECTED (:3002)" : "LOCAL STREAM"}
              </span>
            </div>

            <div className="h-4 w-px bg-zinc-800" />

            <div className="flex gap-1">
              {["all", "mint", "trade", "burn", "transfer"].map((type) => (
                <button
                  key={type}
                  onClick={() => setFilterType(type)}
                  className={`rounded px-2.5 py-1 text-[11px] font-mono uppercase transition-colors ${
                    filterType === type
                      ? "bg-zinc-800 text-zinc-100 border border-zinc-700"
                      : "text-zinc-500 hover:text-zinc-300"
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={() => setEvents([])}
            className="h-7 px-2 text-zinc-500 hover:text-zinc-300"
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" />
            Clear
          </Button>
        </CardContent>
      </Card>

      {/* Events Feed */}
      <div className="space-y-2">
        {filteredEvents.map((evt) => (
          <div
            key={evt.id}
            className="flex items-center justify-between rounded-lg border border-zinc-800 bg-[#09090b] px-4 py-3 text-xs"
          >
            <div className="flex items-center gap-3">
              <Badge
                variant={
                  evt.type === "mint"
                    ? "emerald"
                    : evt.type === "burn"
                    ? "destructive"
                    : "secondary"
                }
                className="uppercase"
              >
                {evt.type}
              </Badge>

              <div>
                <div className="font-mono text-zinc-200">
                  {evt.type === "mint" &&
                    `Minted ${(parseFloat(evt.data.amount) / 1e18).toFixed(6)} AIR for ${evt.data.miner_id} (Epoch #${evt.data.epoch})`}
                  {evt.type === "trade" &&
                    `Order #${evt.data.listing_id} Sold: ${(parseFloat(evt.data.amount_air) / 1e18).toFixed(4)} AIR for ₹${(parseFloat(evt.data.price_tinr) / 1e18).toFixed(0)}`}
                  {evt.type === "burn" &&
                    `Retired ${(parseFloat(evt.data.amount) / 1e18).toFixed(4)} AIR for Compliance (${evt.data.period})`}
                  {evt.type === "transfer" && `Transferred AIR`}
                </div>
                <div className="flex gap-3 text-[11px] font-mono text-zinc-400 mt-0.5">
                  <span>TX: {evt.tx_hash.slice(0, 10)}...</span>
                  <span>BLOCK #{evt.block_number}</span>
                  <span>{new Date(evt.ts).toLocaleTimeString()}</span>
                </div>
              </div>
            </div>

            <div className="font-mono text-right text-xs">
              {evt.type === "mint" && (
                <span className="text-emerald-400 font-medium">
                  +{(parseFloat(evt.data.amount) / 1e18).toFixed(4)} AIR
                </span>
              )}
              {evt.type === "burn" && (
                <span className="text-red-400 font-medium">
                  -{(parseFloat(evt.data.amount) / 1e18).toFixed(4)} AIR
                </span>
              )}
              {evt.type === "trade" && (
                <span className="text-zinc-200 font-medium">
                  ₹{(parseFloat(evt.data.price_tinr) / 1e18).toFixed(0)} tINR
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
