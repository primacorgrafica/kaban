import { SVGProps } from "react";

export function OffsetIcon({ className, ...props }: SVGProps<SVGSVGElement> & { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <circle cx="10" cy="4.5" r="4.5" />
      <circle cx="14" cy="12" r="4.5" />
      <circle cx="10" cy="19.5" r="4.5" />
    </svg>
  );
}
