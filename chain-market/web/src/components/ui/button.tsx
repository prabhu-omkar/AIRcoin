import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-xs font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-zinc-50 text-zinc-900 hover:bg-zinc-200",
        destructive: "bg-red-950 text-red-200 border border-red-800 hover:bg-red-900",
        outline: "border border-zinc-800 bg-transparent hover:bg-zinc-900 hover:text-zinc-50 text-zinc-300",
        secondary: "bg-zinc-900 text-zinc-100 hover:bg-zinc-800 border border-zinc-800",
        ghost: "hover:bg-zinc-900 hover:text-zinc-50 text-zinc-400",
        link: "text-zinc-300 underline-offset-4 hover:underline",
        emerald: "bg-emerald-600 text-white hover:bg-emerald-500 font-medium",
      },
      size: {
        default: "h-8 px-3 py-1.5",
        sm: "h-7 rounded-md px-2.5 text-[11px]",
        lg: "h-9 rounded-md px-4 text-xs",
        icon: "h-7 w-7",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
