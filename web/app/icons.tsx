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

export const SearchIcon = () => (
  <svg {...base} width={16} height={16}>
    <circle cx="9" cy="9" r="5.25" />
    <path d="m13 13 3.5 3.5" />
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

// The marks for what a check found, and for the short messages inside a panel.

export const CheckIcon = () => (
  <svg {...base}>
    <path d="m4.5 10.5 3.5 3.5 7.5-8" />
  </svg>
);

export const CrossIcon = () => (
  <svg {...base}>
    <path d="m5.5 5.5 9 9M14.5 5.5l-9 9" />
  </svg>
);

export const QuestionIcon = () => (
  <svg {...base}>
    <path d="M7.4 7.6a2.6 2.6 0 1 1 4 2.2c-.8.5-1.4 1.1-1.4 2.1M10 15.1v.1" />
  </svg>
);

export const MinusIcon = () => (
  <svg {...base}>
    <path d="M5 10h10" />
  </svg>
);

export const InfoIcon = () => (
  <svg {...base}>
    <circle cx="10" cy="10" r="7.25" />
    <path d="M10 9.3v4.2M10 6.5v.1" />
  </svg>
);

export const AlertIcon = () => (
  <svg {...base}>
    <path d="M10 3.3 17.4 16H2.6zM10 8.2v3.5M10 14v.1" />
  </svg>
);
