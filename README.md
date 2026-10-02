# ARGONAUT RADIO

> Every Argonaut has a frequency.

An unofficial, experimental fan transmission inspired by the
[Argonauts](https://opensea.io/collection/argonauts) by Alpha Centauri Kid / Muse Facktory.

Enter an Argonaut ID (1–9999) and the terminal tunes into its frequency:

- **Music:** a deterministic, evolving acid / warehouse techno track generated in the
  browser with [Strudel](https://strudel.cc). The same ID always produces the same track:
  BPM, key, acid line, groove, arrangement and rave flavour all come from the ID's "DNA".
- **Art:** the Argonaut's real art, read live from its Ethereum contract (fully on-chain)
  and redrawn as phosphor ASCII, animated to the beat.

> **Unofficial fan experiment.** Not affiliated with Alpha Centauri Kid or Muse Facktory.
> The Argonaut art is read live from Ethereum and belongs to its creators.

## Run locally

Requires Node.js 20.9 or newer.

```bash
npm install
npm run dev
```

Then open <http://localhost:3000>.

## Deploy (Vercel)

1. Import the GitHub repository into Vercel (the framework is detected as Next.js).
2. Set the environment variable `NEXT_PUBLIC_SOURCE_URL` to this repository's public URL.
   It is shown as the footer's **SOURCE** link, which the AGPL requires.
3. Deploy. No other configuration, secrets or backend are needed.

## How it works

| File | Role |
| --- | --- |
| `lib/argonaut.ts` | ID validation (1–9999, no leading zeros), deterministic DNA, offline fallback sprite |
| `lib/strudel.ts` | DNA to Strudel pattern code (arrangement, layers, mix), sample preloading, playback |
| `lib/onchain.ts` | Read-only `tokenURI` call to the Argonauts contract; SVG to phosphor ASCII |
| `app/page.tsx` | The terminal UI |
| `next.config.ts` | Security headers (CSP, frame and referrer policies) |

### External services contacted by the browser

- `raw.githubusercontent.com`: audio samples from
  [tidalcycles/Dirt-Samples](https://github.com/tidalcycles/Dirt-Samples), loaded at runtime
  (not redistributed in this repo).
- `ethereum-rpc.publicnode.com`: a public Ethereum node, used for a single read-only call per ID.
  No wallet, no keys, no transactions.

## License

[GNU AGPL-3.0-or-later](./LICENSE). The app uses Strudel, which is AGPL-licensed, so this
project is too: if you run a modified version publicly, you must offer its source code.

## Credits

- [Strudel](https://strudel.cc) (AGPL-3.0), the live-coding music engine.
- [Tidal Dirt-Samples](https://github.com/tidalcycles/Dirt-Samples), the drum and FX samples.
- Argonauts by Alpha Centauri Kid / Muse Facktory, the original art, stored on-chain.
