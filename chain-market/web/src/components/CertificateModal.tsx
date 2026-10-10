import React from "react";
import { X, Printer, ShieldCheck, Check } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

interface CertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  certificateData: {
    companyName: string;
    companyAddress: string;
    amountAir: string;
    period: string;
    txHash: string;
    timestamp: number;
    evidenceHash?: string;
  };
}

export const CertificateModal: React.FC<CertificateModalProps> = ({
  isOpen,
  onClose,
  certificateData,
}) => {
  if (!isOpen) return null;

  const serialNo = `AIR-${certificateData.period}-${certificateData.txHash.slice(2, 10).toUpperCase()}`;
  const particulateRemovedMg = (parseFloat(certificateData.amountAir) * 1000).toLocaleString();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-50 w-full max-w-2xl rounded-lg border border-border bg-card p-8 text-foreground shadow-lg">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Certificate Header */}
        <div className="border-b border-border pb-6 text-center">
          <div className="inline-flex items-center gap-2 mb-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <span className="text-xs font-mono uppercase tracking-widest text-muted-foreground">
              National Clean Air Registry
            </span>
          </div>
          <h2 className="text-lg font-semibold tracking-tight text-foreground">
            Environmental Offset Retirement Certificate
          </h2>
          <div className="mt-1 text-[11px] font-mono text-muted-foreground">
            SERIAL {serialNo}
          </div>
        </div>

        {/* Certificate Content */}
        <div className="py-6 space-y-5">
          <div className="grid grid-cols-2 gap-4 rounded-md border border-border/80 bg-card p-4 text-xs">
            <div>
              <div className="text-[10px] uppercase font-mono text-muted-foreground mb-0.5">Obligated Entity</div>
              <div className="font-medium text-foreground">{certificateData.companyName}</div>
              <div className="font-mono text-[11px] text-muted-foreground truncate">{certificateData.companyAddress}</div>
            </div>

            <div>
              <div className="text-[10px] uppercase font-mono text-muted-foreground mb-0.5">Compliance Period</div>
              <div className="font-medium text-foreground">Annual Period {certificateData.period}</div>
              <div className="text-[11px] text-emerald-600 font-mono">Deducted from Quota</div>
            </div>

            <div>
              <div className="text-[10px] uppercase font-mono text-muted-foreground mb-0.5">Retired Volume</div>
              <div className="font-mono text-base font-semibold text-foreground">
                {certificateData.amountAir} AIR
              </div>
              <div className="text-[10px] text-muted-foreground font-mono">1 AIR = 1 mg PM2.5-eq</div>
            </div>

            <div>
              <div className="text-[10px] uppercase font-mono text-muted-foreground mb-0.5">Particulate Removed</div>
              <div className="font-mono text-base font-semibold text-foreground">
                {particulateRemovedMg} mg
              </div>
              <div className="text-[10px] text-muted-foreground font-mono">Camera-Verified</div>
            </div>
          </div>

          {/* Cryptographic Transaction Hash */}
          <div className="rounded border border-border/80 bg-card p-3 font-mono text-[11px] space-y-1">
            <div className="text-muted-foreground text-[10px] uppercase">Transaction Hash</div>
            <div className="text-foreground/80 break-all">{certificateData.txHash}</div>
            <div className="flex justify-between text-[10px] text-muted-foreground pt-2 border-t border-border mt-2">
              <span>Network: Hardhat / Polygon Amoy</span>
              <span>{new Date(certificateData.timestamp).toUTCString()}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-border pt-4 flex items-center justify-between">
          <Badge variant="outline" className="border-border text-muted-foreground font-mono text-[10px]">
            Audited On-Chain
          </Badge>

          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
              Print
            </Button>
            <Button size="sm" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
