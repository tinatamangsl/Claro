import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

type Props = {
  checked: boolean;
  onChange: () => void;
  label: string;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZES = {
  sm: "h-[15px] w-[15px] rounded-[4px]",
  md: "h-[18px] w-[18px] rounded-[5px]",
  lg: "h-[22px] w-[22px] rounded-[6px]",
} as const;

const ICON = { sm: "h-2.5 w-2.5", md: "h-3 w-3", lg: "h-3.5 w-3.5" } as const;

/** Hand-rolled so it matches Claro's hairline language rather than shadcn's. */
export function CheckToggle({ checked, onChange, label, size = "md", className }: Props) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      className={cn(
        "grid shrink-0 place-items-center border transition-colors",
        SIZES[size],
        checked
          ? "border-positive bg-positive text-white"
          : "border-border bg-card hover:border-foreground/40",
        className,
      )}
    >
      {checked && <Check className={cn(ICON[size], "stroke-[3]")} />}
    </button>
  );
}
