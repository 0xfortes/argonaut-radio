/*
 * Minimal typings for the parts of @strudel/web
 * (v1.3.0) that this project uses.
 *
 * Verified against node_modules/@strudel/web/web.mjs
 * and node_modules/superdough (samples, getAudioContext,
 * loadBuffer).
 */
declare module "@strudel/web" {
  export type InitStrudelOptions = {
    prebake?: () => unknown;
    [key: string]: unknown;
  };

  export function initStrudel(
    options?: InitStrudelOptions
  ): Promise<unknown>;

  export function evaluate(
    code: string,
    autoplay?: boolean
  ): Promise<unknown>;

  export function hush(): void;

  export function samples(
    sampleMap: string | Record<string, unknown>,
    baseUrl?: string,
    options?: Record<string, unknown>
  ): Promise<void>;

  export function getAudioContext(): AudioContext;

  export function loadBuffer(
    url: string,
    audioContext: AudioContext,
    s?: string,
    n?: number
  ): Promise<AudioBuffer>;
}
