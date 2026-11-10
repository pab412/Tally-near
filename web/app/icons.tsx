// A small authored icon set: 20px grid, 1.75 stroke, round caps.

const base = {
  width: 20,
  height: 20,
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const UploadIcon = () => (
  <svg {...base}>
    <path d="M10 13V3.5M6 7.5l4-4 4 4M3.5 13.5v2a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-2" />
  </svg>
);

export const ExternalIcon = () => (
  <svg {...base} width={16} height={16}>
    <path d="M8.5 4.5h-4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-4M11.5 3.5h5v5M16.5 3.5 9 11" />
  </svg>
);

export const LockIcon = () => (
  <svg {...base} width={16} height={16}>
    <rect x="4" y="9" width="12" height="8" rx="1.5" />
    <path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9" />
  </svg>
);

export const SealIcon = () => (
  <svg {...base}>
    <path d="M10 2.5 16 5v4.5c0 3.6-2.5 6.6-6 8-3.5-1.4-6-4.4-6-8V5z" />
    <path d="m7.2 9.8 2 2 3.6-3.8" />
  </svg>
);
