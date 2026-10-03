import { ImageResponse } from "next/og";

/*
 * Link-preview card (X / Open Graph) for the whole
 * site. Rendered once at build time by
 * app/opengraph-image.tsx and app/twitter-image.tsx.
 * Static data only: no network requests.
 */

export const SHARE_CARD_SIZE = {
  width: 1200,
  height: 630,
};

export const SHARE_CARD_ALT =
  "Argonaut Radio — every Argonaut has a frequency.";

// Same palette as app/globals.css.
const GREEN = "#72ff72";
const GREEN_DIM = "#285b28";
const BLACK = "#020402";
const MAGENTA = "#ff4fd8";
const FACE = "#89959a";

/*
 * The pixel Argonaut from app/icon.svg (16×16 grid):
 * [x, y, width, height, colour].
 */
const ICON_PIXELS: [number, number, number, number, string][] = [
  // helmet
  [5, 1, 6, 1, GREEN],
  [4, 2, 8, 1, GREEN],
  [3, 3, 10, 1, GREEN],
  [3, 4, 11, 1, GREEN],
  // face
  [3, 5, 2, 2, FACE],
  [3, 7, 10, 1, FACE],
  [3, 8, 9, 1, FACE],
  [4, 9, 8, 1, FACE],
  [5, 10, 6, 1, FACE],
  // visor
  [5, 5, 10, 2, MAGENTA],
  // neck + torso
  [7, 11, 2, 1, GREEN_DIM],
  [5, 12, 6, 1, GREEN_DIM],
  [3, 13, 10, 1, GREEN_DIM],
  [2, 14, 12, 1, GREEN_DIM],
];

const PIXEL = 24;

export function renderShareCard(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          position: "relative",
          padding: "0 90px",
          gap: 80,
          backgroundColor: BLACK,
          backgroundImage:
            "repeating-linear-gradient(to bottom, rgba(114,255,114,0.05) 0px, rgba(114,255,114,0.05) 2px, transparent 2px, transparent 6px)",
          color: GREEN,
          letterSpacing: "0.08em",
        }}
      >
        <div
          style={{
            display: "flex",
            position: "relative",
            width: PIXEL * 16,
            height: PIXEL * 16,
            border: `2px solid ${GREEN_DIM}`,
            flexShrink: 0,
          }}
        >
          {ICON_PIXELS.map(([x, y, w, h, colour], index) => (
            <div
              key={index}
              style={{
                position: "absolute",
                left: x * PIXEL,
                top: y * PIXEL,
                width: w * PIXEL,
                height: h * PIXEL,
                backgroundColor: colour,
              }}
            />
          ))}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: 560,
          }}
        >
          <div style={{ fontSize: 30, color: GREEN_DIM }}>
            ARGONAUT RADIO
          </div>

          <div
            style={{
              fontSize: 56,
              lineHeight: 1.1,
              marginTop: 24,
            }}
          >
            EVERY ARGONAUT HAS A FREQUENCY.
          </div>

          <div
            style={{
              fontSize: 28,
              marginTop: 32,
              color: GREEN_DIM,
            }}
          >
            ENTER AN ID 1–9999 · TUNE IN
          </div>

          <div
            style={{
              fontSize: 24,
              marginTop: 40,
              color: MAGENTA,
            }}
          >
            ● SIGNAL NETWORK ONLINE
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            bottom: 36,
            left: 90,
            fontSize: 18,
            color: GREEN_DIM,
          }}
        >
          UNOFFICIAL FAN EXPERIMENT
        </div>
      </div>
    ),
    SHARE_CARD_SIZE
  );
}
