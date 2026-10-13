import { SVGProps } from "react";

export function PrimacorIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      width={props.width ?? 24}
      height={props.height ?? 24}
      className={props.className}
      {...props}
    >
      {/* Simplified icosahedron / gem shape matching the Primacor logo */}
      <polygon points="12,2 4,8 6,18 18,18 20,8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <line x1="12" y1="2" x2="6" y2="18" stroke="currentColor" strokeWidth="1.2" />
      <line x1="12" y1="2" x2="18" y2="18" stroke="currentColor" strokeWidth="1.2" />
      <line x1="4" y1="8" x2="20" y2="8" stroke="currentColor" strokeWidth="1.2" />
      <line x1="12" y1="2" x2="12" y2="8" stroke="currentColor" strokeWidth="1.2" />
      <line x1="4" y1="8" x2="12" y2="14" stroke="currentColor" strokeWidth="1.2" />
      <line x1="20" y1="8" x2="12" y2="14" stroke="currentColor" strokeWidth="1.2" />
      <line x1="12" y1="14" x2="6" y2="18" stroke="currentColor" strokeWidth="1.2" />
      <line x1="12" y1="14" x2="18" y2="18" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
