import React from "react";

export function GalpaoIcon({ className = "h-4 w-4", ...props }: React.SVGProps<SVGSVGElement> & { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {/* Roof - triangular industrial roof */}
      <path d="M2 10 L12 4 L22 10" />
      {/* Walls */}
      <path d="M4 10 L4 20 L20 20 L20 10" />
      {/* Large door / gate */}
      <rect x="9" y="14" width="6" height="6" rx="0.5" />
      {/* Roof detail line */}
      <path d="M2 10 L22 10" />
    </svg>
  );
}
