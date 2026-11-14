// Shared game maths and a cryptographically secure random source.
// The pay tables live in betting/game-logic.js so the browser demo and the server use the same rules.
import { createRequire } from 'node:module';
import { randomInt } from 'node:crypto';

const require = createRequire(import.meta.url);
export const GL = require('../../../betting/game-logic.js');

/** Uniform number in [0, 1) from the OS CSPRNG (47 bits). */
export const rng = () => randomInt(0, 2 ** 47) / 2 ** 47;
export const r2 = n => Math.round(n * 100) / 100;
/** Poisson sample with the CSPRNG. */
export const samplePois = (l, max = 12) => { let k = 0, p = Math.exp(-l), s = p; const u = rng(); while (u > s && k < max) { k++; p *= l / k; s += p; } return k; };
