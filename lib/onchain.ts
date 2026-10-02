import {
  isValidArgonautId,
  type ArgonautPart,
  type AsciiRun,
} from "./argonaut";

/*
 * Reads an Argonaut's real art from the Ethereum
 * contract and turns it into phosphor ASCII.
 *
 * Read-only: a single public `eth_call` to
 * tokenURI(id). No wallet, no keys, no backend.
 *
 * Argonauts by ACK / Muse Facktory store their art
 * fully on-chain: tokenURI returns base64 JSON whose
 * `image` is a 24×24 SVG made only of <rect>s.
 *
 * Everything coming back from the network is
 * treated as untrusted: strict format checks, size
 * caps, and the SVG is parsed as data — it is never
 * inserted into the page.
 */

const ARGONAUTS_CONTRACT = "0x387c41b0b2f1128de44db1bcf8baad085f26392c";

const RPC_URL = "https://ethereum-rpc.publicnode.com";

// tokenURI(uint256)
const TOKEN_URI_SELECTOR = "0xc87b56dd";

const REQUEST_TIMEOUT_MS = 8000;
// Real results run ~180k–260k chars; the cap only
// guards against absurd responses.
const MAX_RESULT_CHARS = 1_000_000;

const GRID_SIZE = 24;

const JSON_PREFIX = "data:application/json;base64,";
const SVG_PREFIX = "data:image/svg+xml;base64,";

/*
 * Traits shown in the readout, in display order
 * (others, like the print-claim status, are left
 * out). Each token only has some of them.
 */
const TRAIT_LABELS: Record<string, string> = {
  Palette: "PALETTE",
  Bones: "BONES",
  Crown: "CROWN",
  Sight: "SIGHT",
  Cloak: "CLOAK",
  Relic: "RELIC",
  Artifact: "ARTIFACT",
};

const MAX_TRAIT_LENGTH = 40;

export type ArgonautTrait = {
  label: string;
  value: string;
};

export type ArgonautArt = {
  sprite: AsciiRun[][];
  traits: ArgonautTrait[];
};

// One hex colour per pixel; null = background.
type PixelGrid = (string | null)[][];

const cache = new Map<string, ArgonautArt>();

export async function fetchArgonautArt(
  id: string,
  rpcUrl: string = RPC_URL
): Promise<ArgonautArt> {
  if (!isValidArgonautId(id)) {
    throw new Error("Argonaut ID must be between 1 and 9999.");
  }

  const cached = cache.get(id);

  if (cached) {
    return cached;
  }

  const result = await callTokenUri(Number(id), rpcUrl);
  const art = artFromTokenUriResult(result);

  cache.set(id, art);

  return art;
}

async function callTokenUri(
  tokenId: number,
  rpcUrl: string
): Promise<string> {
  const data =
    TOKEN_URI_SELECTOR + tokenId.toString(16).padStart(64, "0");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_call",
        params: [{ to: ARGONAUTS_CONTRACT, data }, "latest"],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`RPC request failed (${response.status}).`);
    }

    const body: unknown = await response.json();
    const result =
      typeof body === "object" && body !== null && "result" in body
        ? (body as { result: unknown }).result
        : undefined;

    if (typeof result !== "string") {
      throw new Error("RPC returned no result.");
    }

    return result;
  } finally {
    clearTimeout(timeout);
  }
}

/*
 * eth_call result (ABI-encoded string) → art.
 * Exported for testing.
 */
export function artFromTokenUriResult(result: string): ArgonautArt {
  const uri = decodeAbiString(result);

  if (!uri.startsWith(JSON_PREFIX)) {
    throw new Error("Unexpected tokenURI format.");
  }

  const metadata: unknown = JSON.parse(
    decodeBase64Utf8(uri.slice(JSON_PREFIX.length))
  );

  if (typeof metadata !== "object" || metadata === null) {
    throw new Error("Unexpected metadata.");
  }

  const { image, attributes } = metadata as {
    image?: unknown;
    attributes?: unknown;
  };

  if (typeof image !== "string" || !image.startsWith(SVG_PREFIX)) {
    throw new Error("Unexpected image format.");
  }

  const svg = decodeBase64Utf8(image.slice(SVG_PREFIX.length));

  return {
    sprite: gridToSprite(svgToGrid(svg)),
    traits: readTraits(attributes),
  };
}

function decodeAbiString(result: string): string {
  if (
    result.length > MAX_RESULT_CHARS ||
    !/^0x[0-9a-fA-F]+$/.test(result) ||
    result.length % 2 !== 0
  ) {
    throw new Error("Malformed RPC result.");
  }

  const hex = result.slice(2);

  // [offset (32 bytes)][length (32 bytes)][bytes…]
  const offset = parseInt(hex.slice(0, 64), 16) * 2;
  const length = parseInt(hex.slice(offset, offset + 64), 16) * 2;
  const start = offset + 64;

  if (
    !Number.isSafeInteger(offset) ||
    !Number.isSafeInteger(length) ||
    start + length > hex.length
  ) {
    throw new Error("Malformed RPC result.");
  }

  const bytes = new Uint8Array(length / 2);

  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(start + i * 2, start + i * 2 + 2), 16);
  }

  return new TextDecoder().decode(bytes);
}

function decodeBase64Utf8(base64: string): string {
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

/*
 * Rasterise the SVG's <rect>s into a 24×24 grid.
 * Only integer geometry, #rrggbb fills and an
 * optional numeric fill-opacity are accepted;
 * anything else is ignored.
 */
function svgToGrid(svg: string): PixelGrid {
  const grid: (string | null)[][] = Array.from({ length: GRID_SIZE }, () =>
    Array<string | null>(GRID_SIZE).fill(null)
  );

  const rectPattern =
    /<rect x="(\d{1,2})" y="(\d{1,2})" width="(\d{1,2})" height="(\d{1,2})" fill="(#[0-9a-fA-F]{6})"(?: fill-opacity="(0(?:\.\d{1,3})?|1(?:\.0{1,3})?)")?\s*\/>/g;

  let painted = 0;

  for (const match of svg.matchAll(rectPattern)) {
    const [x, y, width, height] = match.slice(1, 5).map(Number);
    const fill = match[5].toLowerCase();
    const opacity = match[6] === undefined ? 1 : Number(match[6]);

    for (let row = y; row < Math.min(y + height, GRID_SIZE); row++) {
      for (let col = x; col < Math.min(x + width, GRID_SIZE); col++) {
        const below = grid[row][col];

        // Translucent rects are shading over the
        // pixel below (shadows / highlights).
        grid[row][col] =
          opacity < 1 && below !== null
            ? blend(below, fill, opacity)
            : fill;
      }
    }

    painted++;
  }

  if (painted === 0) {
    throw new Error("No pixels found in the Argonaut art.");
  }

  // The first row is the solid background colour.
  const background = grid[0][0];

  return grid.map((row) =>
    row.map((color) => (color === background ? null : color))
  );
}

function blend(below: string, top: string, opacity: number): string {
  return (
    "#" +
    [1, 3, 5]
      .map((index) => {
        const a = parseInt(below.slice(index, index + 2), 16);
        const b = parseInt(top.slice(index, index + 2), 16);

        return Math.round(a + (b - a) * opacity)
          .toString(16)
          .padStart(2, "0");
      })
      .join("")
  );
}

function luminance(color: string): number {
  const [r, g, b] = [1, 3, 5].map(
    (index) => parseInt(color.slice(index, index + 2), 16) / 255
  );

  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const TONES: { part: ArgonautPart; glyph: string }[] = [
  { part: "tone1", glyph: "░" },
  { part: "tone2", glyph: "▒" },
  { part: "tone3", glyph: "▓" },
  { part: "tone4", glyph: "█" },
];

/*
 * Pixel grid → ASCII runs. Each glyph keeps the
 * pixel's real colour; the glyph itself (░▒▓█)
 * follows brightness, normalised per Argonaut so
 * dark and light palettes both keep their shading.
 */
function gridToSprite(grid: PixelGrid): AsciiRun[][] {
  const levels = grid
    .flat()
    .filter((color): color is string => color !== null)
    .map(luminance);

  const min = Math.min(...levels);
  const range = Math.max(...levels) - min || 1;

  return grid.map((row) => {
    const runs: AsciiRun[] = [];

    for (const color of row) {
      if (color === null) {
        const last = runs[runs.length - 1];

        if (last && last.part === null) {
          last.text += "  ";
        } else {
          runs.push({ part: null, text: "  " });
        }

        continue;
      }

      const level = (luminance(color) - min) / range;
      const tone =
        TONES[Math.min(TONES.length - 1, Math.floor(level * TONES.length))];
      const text = tone.glyph.repeat(2);
      const last = runs[runs.length - 1];

      if (last && last.part === tone.part && last.color === color) {
        last.text += text;
      } else {
        runs.push({ part: tone.part, text, color });
      }
    }

    return runs;
  });
}

function readTraits(attributes: unknown): ArgonautTrait[] {
  if (!Array.isArray(attributes)) {
    return [];
  }

  const traits: ArgonautTrait[] = [];

  for (const attribute of attributes) {
    if (typeof attribute !== "object" || attribute === null) {
      continue;
    }

    const { trait_type: type, value } = attribute as {
      trait_type?: unknown;
      value?: unknown;
    };

    if (
      typeof type === "string" &&
      typeof value === "string" &&
      Object.hasOwn(TRAIT_LABELS, type)
    ) {
      traits.push({
        label: TRAIT_LABELS[type],
        value: value.slice(0, MAX_TRAIT_LENGTH).toUpperCase(),
      });
    }
  }

  // Fixed display order.
  const order = Object.values(TRAIT_LABELS);

  return traits.sort(
    (a, b) => order.indexOf(a.label) - order.indexOf(b.label)
  );
}
