import type { Lab } from "./color-conversion.ts";

export function deltaE2000(lab1: Lab, lab2: Lab): number {
  const { l: L1, a: a1, b: b1 } = lab1;
  const { l: L2, a: a2, b: b2 } = lab2;

  const deg = Math.PI / 180;
  const pow25to7 = 6103515625; // 25^7

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const meanC = (C1 + C2) / 2;
  const meanC7 = meanC ** 7;
  const G = 0.5 * (1 - Math.sqrt(meanC7 / (meanC7 + pow25to7)));

  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);

  const hueAngle = (b: number, ap: number) => {
    if (b === 0 && ap === 0) return 0;
    const h = Math.atan2(b, ap) / deg;
    return h < 0 ? h + 360 : h;
  };
  const h1p = hueAngle(b1, a1p);
  const h2p = hueAngle(b2, a2p);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * deg);

  const meanLp = (L1 + L2) / 2;
  const meanCp = (C1p + C2p) / 2;

  let meanHp: number;
  if (C1p * C2p === 0) {
    meanHp = h1p + h2p;
  } else if (Math.abs(h1p - h2p) <= 180) {
    meanHp = (h1p + h2p) / 2;
  } else if (h1p + h2p < 360) {
    meanHp = (h1p + h2p + 360) / 2;
  } else {
    meanHp = (h1p + h2p - 360) / 2;
  }

  const T =
    1 -
    0.17 * Math.cos((meanHp - 30) * deg) +
    0.24 * Math.cos(2 * meanHp * deg) +
    0.32 * Math.cos((3 * meanHp + 6) * deg) -
    0.2 * Math.cos((4 * meanHp - 63) * deg);

  const dTheta = 30 * Math.exp(-(((meanHp - 275) / 25) ** 2));
  const meanCp7 = meanCp ** 7;
  const Rc = 2 * Math.sqrt(meanCp7 / (meanCp7 + pow25to7));
  const lOffset = (meanLp - 50) ** 2;
  const Sl = 1 + (0.015 * lOffset) / Math.sqrt(20 + lOffset);
  const Sc = 1 + 0.045 * meanCp;
  const Sh = 1 + 0.015 * meanCp * T;
  const Rt = -Math.sin(2 * dTheta * deg) * Rc;

  const termL = dLp / Sl;
  const termC = dCp / Sc;
  const termH = dHp / Sh;

  return Math.sqrt(
    termL * termL + termC * termC + termH * termH + Rt * termC * termH,
  );
}
