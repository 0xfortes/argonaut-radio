"use client";

import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import {
  generateDNA,
  generateArgonautSprite,
  isValidArgonautId,
  type AsciiRun,
} from "@/lib/argonaut";

import {
  playTransmission,
  prepareStrudel,
  stopTransmission,
} from "@/lib/strudel";

import {
  fetchArgonautArt,
  type ArgonautTrait,
} from "@/lib/onchain";

/*
 * Public source repository (required by the AGPL,
 * which covers the Strudel audio engine). Set
 * NEXT_PUBLIC_SOURCE_URL in Vercel. Only https
 * URLs are used as a link.
 */
const SOURCE_URL =
  process.env.NEXT_PUBLIC_SOURCE_URL?.startsWith("https://")
    ? process.env.NEXT_PUBLIC_SOURCE_URL
    : "";

type SignalSource =
  | "decoding"
  | "chain"
  | "local";

const SIGNAL_LABELS: Record<SignalSource, string> = {
  decoding: ":: DECODING ON-CHAIN SIGNAL ::",
  chain: ":: ON-CHAIN SIGNAL LOCK ::",
  local: ":: CHAIN UNREACHABLE — LOCAL SIGNAL ::",
};

export default function Home() {
  const [argonautId, setArgonautId] =
    useState("");

  const [dna, setDNA] =
    useState<
      ReturnType<typeof generateDNA> | null
    >(null);

  const [sprite, setSprite] =
    useState<AsciiRun[][]>([]);

  // Where the ASCII came from: the contract, or
  // the local generator when the chain is
  // unreachable.
  const [signalSource, setSignalSource] =
    useState<SignalSource>("decoding");

  const [traits, setTraits] =
    useState<ArgonautTrait[]>([]);

  // True once the audio has actually started, so
  // the ASCII animation starts with the music.
  const [live, setLive] =
    useState(false);

  // Ignores a late playback start from a
  // transmission the user already left.
  const transmissionRun =
    useRef(0);

  const [transmitting, setTransmitting] =
    useState(false);

  const [error, setError] =
    useState("");

  useEffect(() => {
    prepareStrudel();
  }, []);

  async function transmit() {
    const id = argonautId.trim();

    if (!isValidArgonautId(id)) {
      setError(
        "INVALID FREQUENCY — ENTER ARGONAUT 1–9999"
      );

      return;
    }

    setError("");

    const generated =
      generateDNA(id);

    const run =
      ++transmissionRun.current;

    setDNA(generated);
    setSprite([]);
    setTraits([]);
    setSignalSource("decoding");
    setLive(false);
    setTransmitting(true);

    // Real art from the contract, in parallel with
    // the audio (never blocks the music).
    fetchArgonautArt(id)
      .then((art) => {
        if (transmissionRun.current === run) {
          setSprite(art.sprite);
          setTraits(art.traits);
          setSignalSource("chain");
        }
      })
      .catch((artError) => {
        console.warn(
          "On-chain art unavailable, using local signal:",
          artError
        );

        if (transmissionRun.current === run) {
          setSprite(
            generateArgonautSprite(
              id,
              generated
            )
          );
          setSignalSource("local");
        }
      });

    try {
      await playTransmission(
        id,
        generated
      );

      if (transmissionRun.current === run) {
        setLive(true);
      }
    } catch (playError) {
      console.error(
        "Transmission failed:",
        playError
      );

      setTransmitting(false);
      setError(
        "SIGNAL LOST — AUDIO ENGINE FAILED. TRY AGAIN."
      );
    }
  }

  function resetTransmission() {
    stopTransmission().catch((stopError) => {
      console.error(
        "Failed to stop transmission:",
        stopError
      );
    });

    transmissionRun.current++;

    setArgonautId("");
    setDNA(null);
    setSprite([]);
    setTraits([]);
    setSignalSource("decoding");
    setLive(false);
    setTransmitting(false);
    setError("");
  }

  return (
    <main className="radio-screen">
      <div className="scanlines" />
      <div className="radio-noise" />

      <div className="radio-content">
        {!transmitting ? (
          <section className="terminal">
            <div className="terminal-header">
              ARGONAUT RADIO
              <span>v0.1</span>
            </div>

            <div className="terminal-line">
              ----------------------------------------
            </div>

            <div className="system-message">
              SIGNAL NETWORK ONLINE
            </div>

            <div className="system-message dim">
              EVERY ARGONAUT HAS A FREQUENCY.
            </div>

            <div className="terminal-spacer" />

            <div className="frequency-label">
              ENTER ARGONAUT ID
            </div>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                transmit();
              }}
              className="frequency-form"
            >
              <span className="prompt">
                &gt;
              </span>

              <input
                autoFocus
                value={argonautId}
                onChange={(event) => {
                  const value =
                    event.target.value.replace(
                      /\D/g,
                      ""
                    );

                  if (value.length <= 4) {
                    setArgonautId(value);
                    setError("");
                  }
                }}
                placeholder="4821"
                className="frequency-input"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={4}
                autoComplete="off"
              />

              <button
                type="submit"
                className="transmit-button"
              >
                [ ENTER ]
              </button>
            </form>

            {error && (
              <div className="system-message error-message">
                {error}
              </div>
            )}

            <div className="terminal-spacer-small" />

            <div className="system-message dim">
              ARGONAUTS 1 — 9999
            </div>
          </section>
        ) : (
          <section className="transmission">
            <div className="transmission-header">
              <div>
                <div className="tiny-label">
                  ARGONAUT RADIO
                </div>

                <div className="signal-status">
                  SIGNAL ACQUIRED
                </div>
              </div>

              <div className="signal-light">
                ●
              </div>
            </div>

            <div className="argonaut-grid">
              <div className="ascii-panel">
                <div className="ascii-label">
                  ARGONAUT SIGNAL
                </div>

                <div className="ascii-frame">
                  <pre
                    className="argonaut-ascii"
                    data-live={live}
                    style={
                      {
                        "--beat": `${
                          dna ? 60 / dna.bpm : 0.5
                        }s`,
                      } as CSSProperties
                    }
                  >
                    {sprite.map(
                      (runs, rowIndex) => (
                        <span
                          key={rowIndex}
                          className="ascii-row"
                        >
                          {runs.map(
                            (run, runIndex) => (
                              <span
                                key={runIndex}
                                className={
                                  run.part
                                    ? `part-${run.part}`
                                    : undefined
                                }
                              >
                                {run.text}
                              </span>
                            )
                          )}
                        </span>
                      )
                    )}
                  </pre>
                </div>

                <div className="ascii-interference">
                  {SIGNAL_LABELS[signalSource]}
                </div>
              </div>

              <div className="signal-panel">
                <div className="frequency-display">
                  <div className="frequency-small">
                    FREQUENCY
                  </div>

                  <div className="argonaut-number">
                    #{argonautId}
                  </div>
                </div>

                {dna && (
                  <div className="dna-readout">
                    <div className="readout-row">
                      <span>BPM</span>
                      <span>
                        {dna.bpm}
                      </span>
                    </div>

                    <div className="readout-row">
                      <span>ROOT</span>
                      <span>
                        {dna.root.toUpperCase()}
                      </span>
                    </div>

                    <div className="readout-row">
                      <span>ACID</span>
                      <span>
                        {dna.acid}%
                      </span>
                    </div>

                    <div className="readout-row">
                      <span>PRESSURE</span>
                      <span>
                        {dna.pressure}%
                      </span>
                    </div>

                    <div className="readout-row">
                      <span>CHAOS</span>
                      <span>
                        {dna.chaos}%
                      </span>
                    </div>

                    <div className="readout-row">
                      <span>SIGNAL</span>
                      <span>
                        {dna.brightness}%
                      </span>
                    </div>

                    <div className="readout-row">
                      <span>GROOVE</span>
                      <span>
                        {dna.groove}
                      </span>
                    </div>

                    <div className="readout-row">
                      <span>MACHINE</span>
                      <span>
                        {dna.machine}
                      </span>
                    </div>

                    {traits.map((trait) => (
                      <div
                        key={trait.label}
                        className="readout-row"
                      >
                        <span>{trait.label}</span>
                        <span>{trait.value}</span>
                      </div>
                    ))}
                  </div>
                )}

                <div className="signal-meter">
                  <div className="meter-label">
                    SIGNAL
                  </div>

                  <div className="meter-bars">
                    {Array.from({
                      length: 32,
                    }).map(
                      (_, index) => (
                        <span
                          key={index}
                          className="meter-bar"
                          style={{
                            animationDelay:
                              `${index * 35}ms`,
                          }}
                        />
                      )
                    )}
                  </div>
                </div>

                <div className="transmission-status">
                  <span className="status-pulse">
                    ●
                  </span>

                  TRANSMITTING
                </div>

                <button
                  onClick={resetTransmission}
                  className="new-frequency"
                >
                  &lt; NEW FREQUENCY
                </button>
              </div>
            </div>
          </section>
        )}
      </div>

      <footer className="radio-footer">
        UNOFFICIAL FAN EXPERIMENT · NOT AFFILIATED
        WITH ALPHA CENTAURI KID OR MUSE FACKTORY ·
        ARGONAUT ART IS READ LIVE FROM ETHEREUM AND
        BELONGS TO ITS CREATORS ·{" "}
        {SOURCE_URL ? (
          <a
            href={SOURCE_URL}
            target="_blank"
            rel="noopener noreferrer"
          >
            SOURCE (AGPL-3.0)
          </a>
        ) : (
          "SOURCE: AGPL-3.0 (LINK PENDING)"
        )}
      </footer>
    </main>
  );
}