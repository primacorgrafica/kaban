import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 font-semibold shadow-xs dark:bg-gradient-to-r dark:from-cyan-500 dark:to-blue-600 dark:hover:from-cyan-400 dark:hover:to-blue-500 dark:text-slate-950 dark:shadow-[0_0_20px_-3px_rgba(6,182,212,0.35)] dark:hover:shadow-[0_0_25px_rgba(6,182,212,0.55)] border-none",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90 shadow-xs dark:bg-rose-600 dark:text-white dark:hover:bg-rose-500 dark:shadow-[0_0_15px_-3px_rgba(244,63,94,0.4)] border-none",
        outline: "border border-border/80 bg-card/85 hover:bg-muted text-foreground backdrop-blur-md dark:border-[#4A5C6A]/40 dark:bg-[#11212D]/80 dark:text-[#CCD0CF] dark:hover:bg-[#253745]/70 dark:hover:text-white dark:hover:border-[#9BA8AB]/50 shadow-2xs transition-all",
        secondary: "bg-secondary/80 text-secondary-foreground hover:bg-secondary border border-border/80 dark:bg-[#253745]/80 dark:text-[#CCD0CF] dark:hover:bg-[#4A5C6A]/70 dark:hover:text-white dark:border-[#4A5C6A]/40",
        ghost: "hover:bg-muted/80 hover:text-foreground text-muted-foreground dark:hover:bg-[#253745]/50 dark:hover:text-[#CCD0CF] dark:text-[#9BA8AB] transition-colors",
        link: "text-primary underline-offset-4 hover:underline dark:text-cyan-400",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-xl px-3 text-xs",
        lg: "h-11 rounded-xl px-8 font-semibold",
        icon: "h-10 w-10 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
