import {
  ARGONAUT_ROOTS,
  isValidArgonautId,
  type ArgonautDNA,
} from "./argonaut";

type StrudelModule = typeof import("@strudel/web");

let strudelPromise: Promise<StrudelModule> | null = null;
let initPromise: Promise<StrudelModule> | null = null;

/*
 * @strudel/web touches `window` at import time,
 * so it must only ever be imported dynamically
 * in the browser.
 */
function getStrudel(): Promise<StrudelModule> {
  if (!strudelPromise) {
    strudelPromise = import("@strudel/web");
  }

  return strudelPromise;
}

/*
 * Only the samples this project plays, from the
 * tidalcycles Dirt-Samples repository. Paths and
 * indices match the repo's own strudel.json, so
 * e.g. "glitch:5" is still glitch/005_P1.wav.
 *
 * Registering this small map (instead of the full
 * 218-bank strudel.json) saves a request, and lets
 * us download every sound before playback starts.
 */
const SAMPLE_BASE =
  "https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/master/";

const SAMPLE_MAP: Record<string, string[]> = {
  bd: ["bd/BT0A0A7.wav"],
  hh: ["hh/000_hh3closedhh.wav"],
  ho: ["ho/HHOD0.wav"],
  cp: ["cp/HANDCLP0.wav"],
  click: ["click/000_click0.wav", "click/001_click1.wav"],
  glitch: [
    "glitch/000_BD.wav",
    "glitch/001_CB.wav",
    "glitch/002_FX.wav",
    "glitch/003_HH.wav",
    "glitch/004_OH.wav",
    "glitch/005_P1.wav",
    "glitch/006_P2.wav",
  ],
  // Voice: spoken digits 0–8 (the bank has no 9).
  numbers: [
    "numbers/0.wav",
    "numbers/1.wav",
    "numbers/2.wav",
    "numbers/3.wav",
    "numbers/4.wav",
    "numbers/5.wav",
    "numbers/6.wav",
    "numbers/7.wav",
    "numbers/8.wav",
  ],
  // C64 SID blips.
  sid: [
    "sid/000_bas2.wav",
    "sid/001_bas.wav",
    "sid/002_basd.wav",
    "sid/003_blipp01.wav",
    "sid/004_blipp02.wav",
  ],
  // Amen break, first 16 slices.
  amencutup: [
    "amencutup/000_AMENCUT_001.wav",
    "amencutup/001_AMENCUT_002.wav",
    "amencutup/002_AMENCUT_003.wav",
    "amencutup/003_AMENCUT_004.wav",
    "amencutup/004_AMENCUT_005.wav",
    "amencutup/005_AMENCUT_006.wav",
    "amencutup/006_AMENCUT_007.wav",
    "amencutup/007_AMENCUT_008.wav",
    "amencutup/008_AMENCUT_009.wav",
    "amencutup/009_AMENCUT_010.wav",
    "amencutup/010_AMENCUT_011.wav",
    "amencutup/011_AMENCUT_012.wav",
    "amencutup/012_AMENCUT_013.wav",
    "amencutup/013_AMENCUT_014.wav",
    "amencutup/014_AMENCUT_015.wav",
    "amencutup/015_AMENCUT_016.wav",
  ],
};

/*
 * Sounds needed from bar 1: preloaded and awaited
 * before playback starts.
 */
const CORE_BANKS = ["bd", "hh", "ho", "cp", "click", "glitch"];

/*
 * Sounds first heard 20 s+ into the track: loaded
 * in the background so they don't delay the start.
 * (Voice digits are loaded per ID in playTransmission.)
 */
const LATE_SOUNDS: [string, number][] = [
  ["sid", 3],
  ["sid", 4],
  ...SAMPLE_MAP.amencutup.map((_, index): [string, number] => [
    "amencutup",
    index,
  ]),
];

function soundUrl(bank: string, index: number): string {
  return SAMPLE_BASE + SAMPLE_MAP[bank][index];
}

/*
 * Download and decode samples ahead of time.
 * Strudel otherwise fetches a sample the first
 * time it plays, and drops that hit if the
 * download is late — which made the start sound
 * thin and quiet. One failed file must not block
 * playback, so failures are only logged.
 */
async function preloadUrls(
  strudel: StrudelModule,
  urls: string[]
): Promise<void> {
  const audioContext = strudel.getAudioContext();

  const results = await Promise.allSettled(
    urls.map((url) => strudel.loadBuffer(url, audioContext))
  );

  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.warn("Sample preload failed:", urls[index], result.reason);
    }
  });
}

/*
 * Initialize Strudel exactly once: register our
 * samples, then preload them.
 */
function ensureInitialized(): Promise<StrudelModule> {
  if (!initPromise) {
    initPromise = getStrudel().then(async (strudel) => {
      await strudel.initStrudel({
        prebake: () => strudel.samples(SAMPLE_MAP, SAMPLE_BASE),
      });

      /*
       * Strudel only registers its AudioWorklets on
       * the first document mousedown. distort (kick,
       * acid) and supersaw need them: without them
       * those notes are dropped, so a keyboard-only
       * first play started without kick and acid.
       * Load them here so every play starts the same.
       */
      await strudel.loadWorklets();

      await preloadUrls(
        strudel,
        CORE_BANKS.flatMap((bank) =>
          SAMPLE_MAP[bank].map((_, index) => soundUrl(bank, index))
        )
      );

      // Not awaited: these are first heard 20 s+ in.
      void preloadUrls(
        strudel,
        LATE_SOUNDS.map(([bank, index]) => soundUrl(bank, index))
      );

      return strudel;
    });

    // Allow a retry if init failed (e.g. network).
    initPromise.catch(() => {
      initPromise = null;
    });
  }

  return initPromise;
}

/*
 * Warm up the import + sample loading before the
 * user clicks, so the click gesture is not lost
 * behind a slow network request.
 */
export function prepareStrudel(): void {
  if (typeof window === "undefined") {
    return;
  }

  ensureInitialized().catch((error) => {
    console.error("Strudel preparation failed:", error);
  });
}

/*
 * Incremented by every play and stop, so a play
 * that is still awaiting init knows it was
 * cancelled and never starts.
 */
let playToken = 0;

/*
 * Stop the scheduler (cycle back to 0) and rebuild
 * the orbit effects, so delay/reverb tails and duck
 * automation from the last transmission never leak
 * into the next one: every play starts from the
 * same state as a fresh page load.
 */
function resetAudio(strudel: StrudelModule): void {
  strudel.hush();
  strudel.resetGlobalEffects();
}

export async function playTransmission(
  id: string,
  dna: ArgonautDNA
): Promise<void> {
  if (typeof window === "undefined") {
    return;
  }

  const token = ++playToken;

  const strudel = await getStrudel();

  // Must happen as close to the user click as
  // possible (browser autoplay policy).
  await strudel.getAudioContext().resume();

  await ensureInitialized();

  // Stopped or replaced while we were waiting.
  if (token !== playToken) {
    return;
  }

  resetAudio(strudel);

  const code = buildTransmissionCode(id, dna);

  // Not awaited: the voice first speaks in the BREAK.
  void preloadUrls(
    strudel,
    voiceSounds(id)
      .filter(([bank]) => bank === "numbers")
      .map(([bank, index]) => soundUrl(bank, index))
  );

  console.log(`ARGONAUT #${id} TRANSMISSION CODE:\n${code}`);

  await strudel.evaluate(code);

  console.log("Strudel transmission evaluated successfully.");
}

/*
 * Bass-register MIDI note for each root.
 */
const ROOT_MIDI: Record<string, number> = {
  c: 36,
  d: 38,
  eb: 39,
  f: 41,
  g: 43,
  ab: 44,
  bb: 46,
};

/*
 * 16-step acid phrases as semitone offsets from
 * the root (natural minor). null = rest.
 */
const ACID_PHRASES: (number | null)[][] = [
  // bouncing octaves
  [
    0, null, 12, 0,
    3, null, 0, 7,
    0, 12, null, 10,
    0, null, 3, 7,
  ],
  // driving root pulse
  [
    0, 0, null, 0,
    0, 12, 0, null,
    0, 0, null, 0,
    12, 0, 3, null,
  ],
  // climbing line
  [
    0, null, 3, 5,
    7, null, 5, 3,
    0, null, 10, 12,
    7, null, 5, 3,
  ],
  // dark minor sixth
  [
    0, 12, null, 8,
    0, null, 7, null,
    0, 12, null, 10,
    8, 7, null, 3,
  ],
];

/*
 * 16-step sub-bass patterns as semitone offsets
 * from the root, one octave below the acid.
 * Off the kick so the two don't fight.
 */
const BASS_PATTERNS: (number | null)[][] = [
  // offbeat
  [
    null, null, 0, null,
    null, null, 0, null,
    null, null, 0, null,
    null, null, 0, null,
  ],
  // rolling
  [
    null, 0, 0, 0,
    null, 0, 0, 0,
    null, 0, 0, 0,
    null, 0, 0, 0,
  ],
  // rolling, moving to the 7th and octave
  [
    null, 0, 0, 0,
    null, 0, 0, 0,
    null, 0, 0, 10,
    null, 0, 12, 0,
  ],
];

const BASS_OCTAVE_OFFSET = -12;

/*
 * Section order of the acid phrases, picked by
 * dna.machine (0–3).
 */
const ACID_ORDERS = [
  [0, 1, 2, 3],
  [1, 0, 3, 2],
  [0, 2, 1, 3],
  [1, 3, 0, 2],
];

/*
 * Arrangement: a 42-bar form of eight sections
 * (about 70 s at 143 BPM). One Strudel cycle = one bar.
 *
 *   0 INTRO   kick, open + sparse hats, acid, bass
 *   1 GROOVE  + clap, glitch, rolling bass
 *   2 ACID    acid phrase changes
 *   3 DRIVE   denser hats, arp enters
 *   4 BREAK   kick, clap, open hats drop out
 *   5 BUILD   drums return, stabs tease, clap roll
 *   6 RETURN  full groove, pressure kick, stabs
 *   7 PEAK    everything, chord change in stabs
 */
/*
 * Bars per section. A 2-bar intro so the groove
 * lands after ~3 s; the main grooves (DRIVE,
 * RETURN, PEAK) get 8 bars to ride.
 *
 *   INTRO GROOVE ACID DRIVE BREAK BUILD RETURN PEAK
 */
const SECTION_BARS = [2, 4, 4, 8, 4, 4, 8, 8];
const SECTION_COUNT = SECTION_BARS.length;

/*
 * A layer's plan: for each section, which of the
 * layer's patterns plays (index), or null = silent.
 */
type Slots = (number | null)[];

/*
 * Optional fill per section: replaces the last bar
 * of that section. null = no fill.
 */
type Fills = (string | null)[];

const NO_FILLS: Fills = Array.from({ length: SECTION_COUNT }, () => null);

/*
 * Closed hi-hat patterns (16 steps per bar),
 * from sparse to dense.
 */
const HAT_PATTERNS = [
  // 3-3-2 syncopation, off the open-hat offbeats
  "hh ~ ~ hh ~ ~ hh ~ hh ~ ~ hh ~ ~ hh ~",
  "hh*8",
  "hh hh ~ hh hh ~ hh hh hh hh ~ hh hh ~ hh hh",
  "hh*16",
];

/*
 * Order of the hat patterns, picked by dna.groove
 * (0–3). Each Argonaut builds its hats in its own
 * deterministic way.
 */
const HAT_ORDERS = [
  [0, 1, 2, 3],
  [0, 2, 1, 3],
  [1, 0, 2, 3],
  [0, 1, 3, 2],
];

/*
 * Glitch percussion (16 steps per bar), from sparse
 * to dense. Banks verified in dirt-samples'
 * strudel.json: glitch:2 = FX, glitch:5 = P1,
 * glitch:6 = P2, click:0/1 = clicks.
 */
const GLITCH_PATTERNS = [
  "~ ~ ~ ~ ~ ~ ~ glitch:5 ~ ~ ~ ~ ~ ~ click:1 ~",
  "~ ~ glitch:5 ~ ~ ~ ~ glitch:6 ~ ~ click:1 ~ ~ glitch:2 ~ ~",
  "~ click:0 glitch:5 ~ ~ glitch:6 ~ click:1 ~ ~ glitch:5 click:0 ~ glitch:2 glitch:6 ~",
];

const GLITCH_BURST = "[click:0 glitch:5]*4";

/*
 * Kick patterns (16 steps per bar). All keep the
 * four-on-the-floor; higher pressure adds a single
 * ghost kick, in the PEAK section only.
 */
const KICK_STRAIGHT = "bd*4";

const KICK_PRESSURE_PATTERNS = [
  KICK_STRAIGHT,
  "bd ~ ~ ~ bd ~ ~ ~ bd ~ ~ ~ bd ~ ~ bd",
  "bd ~ ~ ~ bd ~ ~ ~ bd ~ ~ bd bd ~ ~ ~",
];

const OPEN_HAT = "~ ho ~ ho ~ ho ~ ho";
const CLAP = "~ cp ~ cp";
const CLAP_INTRO = "~ ~ ~ cp";

/*
 * Per-section slots for every layer.
 * Index meaning depends on the layer (see build).
 */
const LAYOUT = {
  //          INTRO GROOVE ACID DRIVE BREAK BUILD RETURN PEAK
  kick:      [0,    0,     0,   0,    null, 0,    0,     1] as Slots,
  openHat:   [0,    0,     0,   0,    null, 0,    0,     0] as Slots,
  hats:      [0,    1,     2,   3,    0,    1,    2,     3] as Slots,
  clap:      [1,    0,     0,   0,    null, 0,    0,     0] as Slots,
  acid:      [0,    1,     2,   3,    1,    3,    2,     0] as Slots,
  bass:      [0,    1,     1,   2,    null, 0,    1,     2] as Slots,
  arp:       [null, null,  null, 0,   1,    1,    2,     3] as Slots,
  stabs:     [null, null,  null, null, null, 0,   1,     2] as Slots,
  glitchLow: [null, 0,     1,   1,    0,    1,    1,     1] as Slots,
  glitchHigh:[null, 0,     1,   2,    0,    2,    1,     2] as Slots,
  voice:     [null, null,  null, null, 0,   null, null,  null] as Slots,
  chirps:    [null, null,  null, null, 0,   1,    null,  null] as Slots,
  riser:     [null, null,  null, null, null, 0,   null,  null] as Slots,
  hoover:    [null, null,  null, null, 0,   0,    null,  null] as Slots,
  amen:      [null, null,  null, 0,   null, null, null,  0] as Slots,
};

const SILENT: Slots = Array.from({ length: SECTION_COUNT }, () => null);

/*
 * Rave flavour by dna.machine:
 *   0 pure acid · 1 + hoover · 2 + amen · 3 + both
 */
const HOOVER_MACHINES = [1, 3];
const AMEN_MACHINES = [2, 3];

/*
 * Data chirps (16 steps per bar): C64 SID blips
 * and clicks.
 */
const CHIRP_BARS = [
  "~ ~ sid:3 ~ ~ ~ ~ ~ ~ click:1 ~ ~ ~ ~ sid:4 ~",
  "~ sid:4 ~ ~ ~ ~ click:0 ~ ~ ~ ~ sid:3 ~ ~ ~ ~",
];

/*
 * Noise riser over the 4-bar BUILD: the highpass
 * opens and the level rises bar by bar.
 */
const RISER_HPF_BARS = ["400", "1200", "3000", "7000"];
const RISER_GAIN_BARS = ["0.05", "0.08", "0.12", "0.18"];

/*
 * Amen break: slices played as 8ths, two bars
 * of slices 0–7 then 8–15.
 */
const AMEN_BARS = [0, 8].map((start) =>
  Array.from({ length: 8 }, (_, step) => `amencutup:${start + step}`).join(" ")
);

/*
 * Fills on the last bar of a section.
 */
const FILLS = {
  //          INTRO GROOVE ACID DRIVE BREAK BUILD RETURN PEAK
  kick:      [null, null,  "~", null, null, "~", null, "bd ~ ~ ~"] as Fills,
  clap:      [null, null,  null, "~ cp ~ [cp cp]", null, "[cp*4] [cp*8]", null, null] as Fills,
  glitch:    [null, null,  GLITCH_BURST, GLITCH_BURST, null, null, null, null] as Fills,
};

/*
 * 16-step arp shapes as semitone offsets from the
 * root (natural minor), played two octaves above
 * the bass. null = rest.
 */
const ARP_SHAPES: (number | null)[][] = [
  // rising minor seventh
  [
    0, 3, 7, 10,
    12, 10, 7, 3,
    0, 3, 7, 10,
    12, 10, 7, 3,
  ],
  // octave pulse
  [
    12, null, 7, null,
    12, null, 3, null,
    12, null, 7, null,
    10, null, 7, null,
  ],
  // broken chords
  [
    0, 7, 12, 7,
    3, 10, 15, 10,
    0, 7, 12, 7,
    2, 8, 14, 8,
  ],
  // hypnotic stutter
  [
    0, null, 0, 12,
    null, 3, null, 7,
    0, null, 0, 12,
    null, 8, null, 7,
  ],
];

const ARP_OCTAVE_OFFSET = 24;

/*
 * Chord stabs, one octave above the bass.
 * Chords as semitone offsets from the root:
 * i = minor triad, VI = major triad on the 6th.
 */
const STAB_OCTAVE_OFFSET = 12;
const CHORD_I = [0, 3, 7];
const CHORD_VI = [8, 12, 15];

/*
 * Stab rhythms: which chord plays on each of the
 * 16 steps (null = rest).
 *   0 tease  — one stab per bar
 *   1 offbeats
 *   2 offbeats with a move to VI in the 2nd half
 */
const STAB_RHYTHMS: (number[] | null)[][] = [
  [
    CHORD_I, null, null, null,
    null, null, null, null,
    null, null, null, null,
    null, null, null, null,
  ],
  [
    null, null, CHORD_I, null,
    null, null, CHORD_I, null,
    null, null, CHORD_I, null,
    null, null, CHORD_I, null,
  ],
  [
    null, null, CHORD_I, null,
    null, null, CHORD_I, null,
    null, null, CHORD_VI, null,
    null, null, CHORD_VI, null,
  ],
];

function offsetsToNotes(
  offsets: (number | null)[],
  baseMidi: number
): string {
  return offsets
    .map((offset) =>
      offset === null ? "~" : String(baseMidi + offset)
    )
    .join(" ");
}

/*
 * Chord steps as mini-notation: "[48,51,55]" per
 * chord, "~" per rest.
 */
function chordsToNotes(
  steps: (number[] | null)[],
  baseMidi: number
): string {
  return steps
    .map((chord) =>
      chord === null
        ? "~"
        : `[${chord.map((offset) => baseMidi + offset).join(",")}]`
    )
    .join(" ");
}

/*
 * 303-style accents: the first step of each beat
 * and every jump up to the octave or seventh.
 */
function isAccent(offset: number | null, step: number): boolean {
  return offset !== null && (step % 4 === 0 || offset >= 10);
}

/*
 * Per-step values for an acid phrase: `accented`
 * on accent steps, `normal` elsewhere (rests keep
 * a value so the grid stays aligned).
 */
function accentValues(
  offsets: (number | null)[],
  normal: number,
  accented: number
): string {
  return offsets
    .map((offset, step) =>
      String(isAccent(offset, step) ? accented : normal)
    )
    .join(" ");
}

/*
 * Build one layer's mini-notation across the whole
 * form: each section plays patterns[slot] for
 * SECTION_BARS[section] bars (or a rest if the slot is
 * null); a fill replaces the section's last bar.
 * A pattern may also be a list of bars, cycled
 * across the section.
 *
 *   "<[a]!4 [b]!3 [fill] [~]!8 ...>"
 */
function sectionLayer(
  patterns: (string | string[])[],
  slots: Slots,
  fills: Fills = NO_FILLS
): string {
  if (slots.length !== SECTION_COUNT || fills.length !== SECTION_COUNT) {
    throw new Error("Arrangement must cover every section.");
  }

  const sections = slots.map((slot, section) => {
    if (slot !== null && (slot < 0 || slot >= patterns.length)) {
      throw new Error("Arrangement slot out of range.");
    }

    const body = slot === null ? "~" : patterns[slot];
    const fill = fills[section];

    const bars = SECTION_BARS[section];
    const playedBars = fill === null ? bars : bars - 1;

    /*
     * A list of bars is written out one bar at a
     * time and cycled ("[a] [b] [a] [b]"): nested
     * "<a b>" does not alternate inside a section.
     */
    const played = Array.isArray(body)
      ? Array.from(
          { length: playedBars },
          (_, bar) => `[${body[bar % body.length]}]`
        ).join(" ")
      : `[${body}]!${playedBars}`;

    return fill === null ? played : `${played} [${fill}]`;
  });

  return `<${sections.join(" ")}>`;
}

/*
 * The voice reads the Argonaut ID digit by digit.
 * The numbers bank has 0–8 only, so a 9 becomes a
 * "corrupted" glitch burst. The ID is validated first;
 * only digit characters ever map to sample names.
 */
function voiceSounds(id: string): [string, number][] {
  if (!isValidArgonautId(id)) {
    throw new Error("Argonaut ID must be between 1 and 9999.");
  }

  return id
    .split("")
    .map((digit): [string, number] =>
      digit === "9" ? ["glitch", 2] : ["numbers", Number(digit)]
    );
}

/*
 * Two bars of voice: two digits per bar, one per
 * half bar. Shorter IDs leave the rest silent.
 */
function voiceBars(id: string): string[] {
  const tokens = voiceSounds(id).map(
    ([bank, index]) => `${bank}:${index}`
  );

  while (tokens.length < 4) {
    tokens.push("~");
  }

  return [`${tokens[0]} ${tokens[1]}`, `${tokens[2]} ${tokens[3]}`];
}

function clampPercent(value: number, name: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid DNA value: ${name}`);
  }

  return Math.min(100, Math.max(0, value));
}

function checkIndex(value: number, length: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value >= length) {
    throw new Error(`Invalid DNA value: ${name}`);
  }
}

/*
 * Turn DNA into Strudel code.
 *
 * evaluate() executes this string as code, so only
 * validated numbers and constant sample names ever
 * reach it — never raw strings from the DNA or
 * the user.
 */
export function buildTransmissionCode(
  id: string,
  dna: ArgonautDNA
): string {
  if (
    !Number.isInteger(dna.bpm) ||
    dna.bpm < 130 ||
    dna.bpm > 150
  ) {
    throw new Error("Invalid DNA value: bpm");
  }

  if (!ARGONAUT_ROOTS.includes(dna.root)) {
    throw new Error("Invalid DNA value: root");
  }

  checkIndex(dna.machine, ACID_ORDERS.length, "machine");
  checkIndex(dna.groove, HAT_ORDERS.length, "groove");

  const rootMidi = ROOT_MIDI[dna.root];
  const acid = clampPercent(dna.acid, "acid");
  const chaos = clampPercent(dna.chaos, "chaos");
  const pressure = clampPercent(dna.pressure, "pressure");
  const brightness = clampPercent(dna.brightness, "brightness");

  /*
   * Acid: dna.machine picks the phrase order.
   */
  const acidOrder = ACID_ORDERS[dna.machine].map(
    (index) => ACID_PHRASES[index]
  );

  const acidSteps = sectionLayer(
    acidOrder.map((phrase) => offsetsToNotes(phrase, rootMidi)),
    LAYOUT.acid
  );

  /*
   * 303 envelope: accents are louder and open the
   * filter further. lpenv is in octaves above the
   * base cutoff.
   */
  const acidEnv = Math.round((2 + acid * 0.015) * 10) / 10;
  const acidEnvAccent = Math.round((acidEnv + 0.8) * 10) / 10;

  const acidGains = sectionLayer(
    acidOrder.map((phrase) => accentValues(phrase, 0.3, 0.45)),
    LAYOUT.acid
  );

  const acidEnvs = sectionLayer(
    acidOrder.map((phrase) =>
      accentValues(phrase, acidEnv, acidEnvAccent)
    ),
    LAYOUT.acid
  );

  /*
   * Sub bass: triangle an octave below the acid.
   * Fundamental ~33–58 Hz for depth; its odd
   * harmonics keep it audible on small speakers.
   */
  const bass = sectionLayer(
    BASS_PATTERNS.map((pattern) =>
      offsetsToNotes(pattern, rootMidi + BASS_OCTAVE_OFFSET)
    ),
    LAYOUT.bass
  );

  const cutoff = Math.round(200 + acid * 4);
  const resonance = Math.round(6 + acid * 0.12);

  /*
   * Hats: dna.groove picks the order of densities.
   */
  const hats = sectionLayer(
    HAT_ORDERS[dna.groove].map((index) => HAT_PATTERNS[index]),
    LAYOUT.hats
  );

  /*
   * Kick: pressure 40–99 picks how hard the PEAK
   * section drives.
   */
  const kickPressure =
    pressure >= 80
      ? KICK_PRESSURE_PATTERNS[2]
      : pressure >= 60
        ? KICK_PRESSURE_PATTERNS[1]
        : KICK_PRESSURE_PATTERNS[0];

  const kick = sectionLayer(
    [KICK_STRAIGHT, kickPressure],
    LAYOUT.kick,
    FILLS.kick
  );

  const openHat = sectionLayer([OPEN_HAT], LAYOUT.openHat);
  const clap = sectionLayer([CLAP, CLAP_INTRO], LAYOUT.clap, FILLS.clap);

  /*
   * Glitch: grows denser through the track; high
   * chaos reaches the densest pattern sooner.
   */
  const glitch = sectionLayer(
    GLITCH_PATTERNS,
    chaos >= 50 ? LAYOUT.glitchHigh : LAYOUT.glitchLow,
    FILLS.glitch
  );

  /*
   * Arp: chaos picks the starting shape; later
   * sections move on through the shapes.
   */
  const arpStart = Math.min(
    ARP_SHAPES.length - 1,
    Math.floor(chaos / 25)
  );

  const arp = sectionLayer(
    ARP_SHAPES.map((_, step) =>
      offsetsToNotes(
        ARP_SHAPES[(arpStart + step) % ARP_SHAPES.length],
        rootMidi + ARP_OCTAVE_OFFSET
      )
    ),
    LAYOUT.arp
  );

  const arpCutoff = Math.round(1200 + brightness * 24);

  // Dotted-eighth delay for the arp, in seconds.
  const arpDelayTime = Math.round((60 / dna.bpm) * 0.75 * 1000) / 1000;

  /*
   * Stabs: minor-key chord stabs, always in key.
   */
  const stabs = sectionLayer(
    STAB_RHYTHMS.map((rhythm) =>
      chordsToNotes(rhythm, rootMidi + STAB_OCTAVE_OFFSET)
    ),
    LAYOUT.stabs
  );

  /*
   * Hacker transmission (BREAK / BUILD): the voice
   * reads the ID on the first two BREAK bars, data
   * chirps follow, and a noise riser leads into
   * the RETURN.
   */
  const voice = sectionLayer(
    [[...voiceBars(id), "~", "~"]],
    LAYOUT.voice
  );

  const chirps = sectionLayer(
    [["~", "~", ...CHIRP_BARS], CHIRP_BARS],
    LAYOUT.chirps
  );

  const riser = sectionLayer(["white*16"], LAYOUT.riser);
  const riserHpf = sectionLayer([RISER_HPF_BARS], LAYOUT.riser);
  const riserGain = sectionLayer([RISER_GAIN_BARS], LAYOUT.riser);

  /*
   * Rave flavour: hoover swell (supersaw minor chord
   * swooping up an octave into the note) and/or an
   * amen break, depending on dna.machine.
   */
  const hoover = sectionLayer(
    [`${chordsToNotes([CHORD_I], rootMidi + STAB_OCTAVE_OFFSET)}@3 ~`],
    HOOVER_MACHINES.includes(dna.machine) ? LAYOUT.hoover : SILENT
  );

  const amen = sectionLayer(
    [AMEN_BARS],
    AMEN_MACHINES.includes(dna.machine) ? LAYOUT.amen : SILENT
  );

  /*
   * Mix: drums on orbit 1, acid + bass on orbit 2
   * (ducked by the kick for the sidechain pump), arp on
   * orbit 3 with its own delay, stabs + hoover on
   * orbit 4 with reverb, voice on orbit 5, chirps on
   * orbit 6 with delay. The acid comes first so its
   * orbit exists before the first kick ducks it.
   */
  const lines = [
    `setcpm(${dna.bpm}/4)`,
    "",
    "stack(",
    `  note("${acidSteps}").s("sawtooth").ftype(1).lpf(${cutoff}).resonance(${resonance}).lpenv("${acidEnvs}").lpdecay(0.15).decay(0.18).sustain(0).gain("${acidGains}").distort("1.5:0.5").orbit(2),`,
    `  note("${bass}").s("triangle").decay(0.14).sustain(0).gain(0.55).orbit(2),`,
    `  s("${kick}").distort("1:0.7").gain(0.9).duck(2).duckdepth(0.6).duckattack(0.15),`,
    `  s("${openHat}").gain(0.25),`,
    `  s("${hats}").gain(0.12),`,
    `  s("${clap}").room(0.25).gain(0.3),`,
    `  s("${glitch}").gain(0.2),`,
    `  note("${arp}").s("square").lpf(${arpCutoff}).decay(0.1).sustain(0).gain(0.12).delay(0.35).delaytime(${arpDelayTime}).delayfeedback(0.4).orbit(3),`,
    `  note("${stabs}").s("sawtooth").lpf(1800).lpenv(2).lpdecay(0.1).decay(0.15).sustain(0).room(0.3).gain(0.13).orbit(4),`,
    `  note("${hoover}").s("supersaw").penv(12).pattack(0.25).attack(0.05).release(0.4).lpf(2500).room(0.4).gain(0.12).orbit(4),`,
    `  s("${amen}").cut(2).hpf(300).gain(0.35),`,
    `  s("${voice}").cut(1).crush(6).hpf(400).lpf(3000).room(0.2).gain(0.9).orbit(5),`,
    `  s("${chirps}").gain(0.2).delay(0.3).delaytime(${arpDelayTime}).delayfeedback(0.3).orbit(6),`,
    `  s("${riser}").hpf("${riserHpf}").gain("${riserGain}")`,
    ")",
  ];

  return lines.join("\n");
}

export async function stopTransmission(): Promise<void> {
  // Cancels a playTransmission still waiting on init.
  playToken++;

  if (!initPromise) {
    return;
  }

  const strudel = await initPromise;

  resetAudio(strudel);
}
