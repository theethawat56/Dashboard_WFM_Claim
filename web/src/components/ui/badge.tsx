import * as React from "react";
import { cn } from "@/lib/utils";

const variants = {
  default: "bg-slate-100 text-slate-800 border-slate-200",
  repair: "bg-[#1976D2] text-white border-transparent",
  claim: "bg-[#E65100] text-white border-transparent",
  reclaim: "bg-[#B71C1C] text-white border-transparent",
  unfixed: "bg-[#B71C1C] text-white border-transparent",
  riskHigh: "bg-[#B71C1C] text-white border-transparent",
  riskMedium: "bg-[#F57F17] text-slate-900 border-transparent",
  riskLow: "bg-[#2E7D32] text-white border-transparent",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: keyof typeof variants;
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => (
    <span
      ref={ref}
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        variants[variant],
        className
      )}
      {...props}
    />
  )
);
Badge.displayName = "Badge";

export { Badge, variants };
