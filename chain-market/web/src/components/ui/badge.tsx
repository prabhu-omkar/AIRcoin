import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-medium transition-colors focus:outline-none focus:ring-1 focus:ring-ring gap-1",
  {
    variants: {
      variant: {
        default: "border border-zinc-700 bg-zinc-800 text-zinc-200",
        secondary: "border border-zinc-800 bg-zinc-900 text-zinc-400",
        destructive: "border border-red-900 bg-red-950/60 text-red-400",
        outline: "border border-zinc-800 text-zinc-400",
        emerald: "border border-emerald-800/80 bg-emerald-950/40 text-emerald-400",
        amber: "border border-amber-800/80 bg-amber-950/40 text-amber-400",
        cyan: "border border-cyan-800/80 bg-cyan-950/40 text-cyan-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
