import type { NextConfig } from "next";

/*
 * Content Security Policy.
 *
 * - script-src 'unsafe-eval': Strudel's evaluate()
 *   runs the generated pattern code with Function()
 *   (@strudel/core/evaluate.mjs). We only ever pass
 *   it code built from validated numbers.
 * - script-src data: Strudel's audio worklets are
 *   loaded from data:text/javascript URLs.
 * - 'unsafe-inline': Next.js inline bootstrap
 *   scripts, and the inline --beat style.
 * - connect-src: the only hosts the app talks to —
 *   Dirt-Samples on GitHub (audio) and a public
 *   Ethereum RPC (on-chain Argonaut art). Any other
 *   outbound request is blocked.
 *
 * Production only: `next dev` needs a hot-reload
 * websocket and its own eval, which this would block.
 */
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' data:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self' https://raw.githubusercontent.com https://ethereum-rpc.publicnode.com",
  "media-src 'self' blob: data:",
  "worker-src 'self' blob: data:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Content-Security-Policy", value: contentSecurityPolicy }]
    : []),
];

const nextConfig: NextConfig = {
  poweredByHeader: false,

  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
