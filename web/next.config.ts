import type { NextConfig } from "next";

// The page talks to two places only: itself, and the public NEAR RPC node it reads records from.
const rpc = new URL(process.env.NEXT_PUBLIC_NEAR_RPC || "https://rpc.testnet.fastnear.com").origin;
const dev = process.env.NODE_ENV !== "production";

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src 'self' ${rpc}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  // The badge picture is drawn from files read at run time: the fonts, the logo and the sample cards.
  outputFileTracingIncludes: { "/badge/[file]": ["./assets/fonts/*.ttf", "./public/tally-t.png", "./public/samples/*.png"] },
  // Links from before the demo moved to /demo: a card's record used to open at /?fp=<fingerprint>.
  async redirects() {
    return [{ source: "/", has: [{ type: "query", key: "fp" }], destination: "/demo", permanent: false }];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
