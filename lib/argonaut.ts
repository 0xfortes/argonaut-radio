export type ArgonautDNA = {
  bpm: number;
  root: string;
  acid: number;
  chaos: number;
  pressure: number;
  brightness: number;
  groove: number;
  machine: number;
};

const roots = [
  "c",
  "d",
  "eb",
  "f",
  "g",
  "ab",
  "bb",
];

export const ARGONAUT_ROOTS: readonly string[] =
  roots;

function randomFromSeed(
  seed: number,
  offset: number
): number {
  const x =
    Math.sin(
      seed * 12.9898 +
      offset * 78.233
    ) *
    43758.5453;

  return x - Math.floor(x);
}

export function isValidArgonautId(
  value: string
): boolean {
  if (!/^[1-9]\d{0,3}$/.test(value)) {
    return false;
  }

  const numericId = Number(value);

  return (
    Number.isInteger(numericId) &&
    numericId >= 1 &&
    numericId <= 9999
  );
}

export function generateDNA(
  id: string
): ArgonautDNA {
  if (!isValidArgonautId(id)) {
    throw new Error(
      "Argonaut ID must be between 1 and 9999."
    );
  }

  const seed = Number(id);

  return {
    bpm:
      138 +
      Math.floor(
        randomFromSeed(seed, 1) * 8
      ),

    root:
      roots[
        Math.floor(
          randomFromSeed(seed, 2) *
            roots.length
        )
      ],

    acid:
      45 +
      Math.floor(
        randomFromSeed(seed, 3) * 55
      ),

    chaos:
      10 +
      Math.floor(
        randomFromSeed(seed, 4) * 90
      ),

    pressure:
      40 +
      Math.floor(
        randomFromSeed(seed, 5) * 60
      ),

    brightness:
      20 +
      Math.floor(
        randomFromSeed(seed, 6) * 80
      ),

    groove:
      Math.floor(
        randomFromSeed(seed, 7) * 4
      ),

    machine:
      Math.floor(
        randomFromSeed(seed, 8) * 4
      ),
  };
}

/*
 * ARGONAUT SPRITE
 *
 * Drawn on the collection's own 24 × 24 pixel grid,
 * side profile facing right:
 *
 *   - rounded helmet / cap
 *   - long visor band projecting past the face
 *   - grey metallic face and jaw
 *   - narrow neck with a gold pixel
 *   - dark torso with light shards
 *
 * Variants seen across the collection (hood,
 * short shades, pipe) are picked deterministically
 * per ID. They are inspired by the collection —
 * not a claim about any real token's traits.
 *
 * Template legend (one character = one pixel):
 *
 *   H h   helmet (light / mid)
 *   O     hood
 *   E     eye socket
 *   V v   visor (band / underside)
 *   F f d face (light / mid / dark)
 *   N     neck
 *   G     gold
 *   T t L torso (dark / shard / light shard)
 *   P     pipe
 *   .     empty (overlays: keep what is below)
 */

export type ArgonautPart =
  | "helmet"
  | "hood"
  | "visor"
  | "face"
  | "gold"
  | "torso"
  | "pipe"
  // brightness bands for on-chain art (lib/onchain.ts)
  | "tone1"
  | "tone2"
  | "tone3"
  | "tone4";

export type AsciiRun = {
  part: ArgonautPart | null;
  text: string;
  // Real pixel colour (#rrggbb) for on-chain art.
  color?: string;
};

export type ArgonautTraits = {
  hood: boolean;
  shades: boolean;
  pipe: boolean;
};

const SPRITE_WIDTH = 24;

const BASE_SPRITE = [
  "........HHhHHH..........",
  "......HHHHHHHHHH........",
  ".....HhHHHHHhHHHH.......",
  ".....hHHHHHHHHHHhh......",
  ".....hhEEEEdffFFF.......",
  ".....fEEEEdfffFF........",
  ".....ffEEdffffFFF.......",
  ".....fdfFffdfFfff.......",
  ".....ffdfFfdffFff.......",
  "......fFfdffdfFFf.......",
  ".......ffdfFfFFdf.......",
  "........dfff.ff.........",
  ".........dd.............",
  ".........NG.............",
  "........dNNd............",
  ".......TTtTTT...........",
  ".....tTTTTLTTtT.........",
  "...L.TTtTTTTLTTT........",
  "..tLTTTtTTTTTTLTT.......",
  "..TTTLTTTTtTTTTTTT......",
];

// Long visor band, projecting forward past the face.
const VISOR_OVERLAY = [
  "........................",
  "........................",
  "........................",
  "........................",
  "........................",
  "..........VVVVVVVVVVV...",
  ".........VVVVVVVVVVVV...",
  "...........vvvvvvvvvv...",
];

// Short shades, flush with the face.
const SHADES_OVERLAY = [
  "........................",
  "........................",
  "........................",
  "........................",
  "........................",
  ".........VVVVVVVV.......",
  ".........VVVVVVVVV......",
  "............vvvvv.......",
];

// Pipe hanging from the mouth, bowl to the right.
const PIPE_OVERLAY = [
  "........................",
  "........................",
  "........................",
  "........................",
  "........................",
  "........................",
  "........................",
  "........................",
  "........................",
  "........................",
  "........................",
  "..............P.........",
  "...............P.PPP....",
  "...............PPPPP....",
  "................PPP.....",
];

// Hood over the head, wrapping the neck and shoulders.
const HOOD_OVERLAY = [
  "......OOOOOOOO..........",
  "....OOOOOOOOOOOO........",
  "...OOOOOOOOOOOOOO.......",
  "...OOOOOOOOOOOOOOO......",
  "..OOOOOO................",
  "..OOOOO.................",
  "..OOOOO.................",
  "..OOOOO.................",
  "..OOOOO.................",
  "..OOOOOO................",
  "..OOOOOOO...............",
  "..OOOOOOOO..............",
  "..OOOOOOOOO.............",
  "..OOOOOOOO..............",
  "..OOOOOOO...............",
  ".OOOOOOOOOOOOOOO........",
  ".OOOOOOOOOOOOOOOO.......",
  "OOOOOOOOOOOOOOOOOO......",
  "OOOOOOOOOOOOOOOOOO......",
  "OOOOOOOOOOOOOOOOOOO.....",
];

/*
 * Pixel code → part and glyph. Darker pixels use
 * lighter glyphs so the figure keeps its shading
 * on the black terminal.
 */
const PIXELS: Record<string, { part: ArgonautPart; glyph: string }> = {
  H: { part: "helmet", glyph: "█" },
  h: { part: "helmet", glyph: "▓" },
  O: { part: "hood", glyph: "▒" },
  E: { part: "face", glyph: "░" },
  V: { part: "visor", glyph: "█" },
  v: { part: "visor", glyph: "▓" },
  F: { part: "face", glyph: "█" },
  f: { part: "face", glyph: "▓" },
  d: { part: "face", glyph: "▒" },
  N: { part: "face", glyph: "▓" },
  G: { part: "gold", glyph: "█" },
  T: { part: "torso", glyph: "▒" },
  t: { part: "torso", glyph: "▓" },
  L: { part: "torso", glyph: "█" },
  P: { part: "pipe", glyph: "█" },
};

function overlay(base: string[], layer: string[]): string[] {
  return base.map((row, y) => {
    const top = layer[y];

    if (!top) {
      return row;
    }

    return row
      .split("")
      .map((pixel, x) => (top[x] && top[x] !== "." ? top[x] : pixel))
      .join("");
  });
}

/*
 * Deterministic per ID: the same Argonaut always
 * looks the same. Uses new seed offsets so the
 * existing DNA values are unaffected.
 */
export function getArgonautTraits(id: string): ArgonautTraits {
  if (!isValidArgonautId(id)) {
    throw new Error("Argonaut ID must be between 1 and 9999.");
  }

  const seed = Number(id);

  return {
    hood: randomFromSeed(seed, 9) < 0.35,
    shades: randomFromSeed(seed, 10) < 0.4,
    pipe: randomFromSeed(seed, 11) < 0.45,
  };
}

function spritePixels(id: string): string[] {
  const traits = getArgonautTraits(id);

  let pixels = overlay(
    BASE_SPRITE,
    traits.shades ? SHADES_OVERLAY : VISOR_OVERLAY
  );

  if (traits.pipe) {
    pixels = overlay(pixels, PIPE_OVERLAY);
  }

  if (traits.hood) {
    pixels = overlay(pixels, HOOD_OVERLAY);
  }

  return pixels;
}

/*
 * The sprite as rows of runs ({ part, text }), so
 * the UI can colour and animate each part. Every
 * pixel is two characters wide to stay roughly
 * square in monospace.
 */
export function generateArgonautSprite(
  id: string,
  _dna: ArgonautDNA
): AsciiRun[][] {
  return spritePixels(id).map((row) => {
    const runs: AsciiRun[] = [];

    for (const code of row.padEnd(SPRITE_WIDTH, ".")) {
      const pixel = PIXELS[code];
      const part = pixel ? pixel.part : null;
      const text = pixel ? pixel.glyph.repeat(2) : "  ";
      const last = runs[runs.length - 1];

      if (last && last.part === part) {
        last.text += text;
      } else {
        runs.push({ part, text });
      }
    }

    return runs;
  });
}

/*
 * Plain-text version of the same sprite.
 */
export function generateArgonautAscii(
  id: string,
  dna: ArgonautDNA
): string {
  return generateArgonautSprite(id, dna)
    .map((runs) => runs.map((run) => run.text).join(""))
    .join("\n");
}
