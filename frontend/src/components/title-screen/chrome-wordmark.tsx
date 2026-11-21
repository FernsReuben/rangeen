import { useId } from "react";

interface ChromeWordmarkProps {
  text: string;
}

/**
 * Liquid-chrome bubble lettering, built from layered SVG:
 *  1. a blurred hot-pink glow,
 *  2. a crisp pink outline,
 *  3. a chrome gradient (cream → gold → horizon → blue) warped by turbulence
 *     and clipped to the letters, drifting slowly to feel liquid,
 *  4. a specular bevel and a soft lower inner shadow for the "inflated" look.
 *
 * Purely decorative: the accessible name comes from the surrounding <h1>.
 */
export function ChromeWordmark({ text }: ChromeWordmarkProps) {
  // Unique ids so multiple instances never collide.
  const id = useId().replace(/:/g, "");
  const ids = {
    letters: `${id}-letters`,
    chrome: `${id}-chrome`,
    warp: `${id}-warp`,
    bevel: `${id}-bevel`,
    shade: `${id}-shade`,
    glow: `${id}-glow`,
    outline: `${id}-outline`,
  };

  const textProps = {
    x: 500,
    y: 178,
    textAnchor: "middle" as const,
    className: "wordmark-text",
    textLength: 940,
    lengthAdjust: "spacingAndGlyphs" as const, // always fits, whatever the font metrics
  };

  return (
    <svg
      className="wordmark"
      viewBox="0 0 1000 250"
      aria-hidden="true"
      focusable="false"
      overflow="visible"
    >
      <defs>
        <clipPath id={ids.letters}>
          <text {...textProps}>{text}</text>
        </clipPath>

        <linearGradient id={ids.chrome} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff8ea" />
          <stop offset="0.16" stopColor="#f6d39a" />
          <stop offset="0.34" stopColor="#e09a3a" />
          <stop offset="0.46" stopColor="#fff2da" />
          <stop offset="0.5" stopColor="#8fd3ff" />
          <stop offset="0.66" stopColor="#2a74ff" />
          <stop offset="0.8" stopColor="#1a4dff" />
          <stop offset="0.9" stopColor="#7fd2ff" />
          <stop offset="1" stopColor="#f3d7a4" />
        </linearGradient>

        <linearGradient id={ids.outline} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff6ae6" />
          <stop offset="0.5" stopColor="#ff2fc8" />
          <stop offset="1" stopColor="#ff8af0" />
        </linearGradient>

        {/* Wavy reflections: displace the gradient, not the letter shapes. */}
        <filter id={ids.warp} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.03" numOctaves="2" seed="7" />
          <feDisplacementMap in="SourceGraphic" scale="46" xChannelSelector="R" yChannelSelector="G" />
        </filter>

        {/* Inflated highlight: light a blurred copy of the letter alpha. */}
        <filter id={ids.bevel} x="-5%" y="-10%" width="110%" height="130%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="7" result="soft" />
          <feSpecularLighting
            in="soft"
            surfaceScale="7"
            specularConstant="1.05"
            specularExponent="22"
            lightingColor="#ffffff"
            result="spec"
          >
            <fePointLight x="420" y="-160" z="260" />
          </feSpecularLighting>
          <feComposite in="spec" in2="SourceAlpha" operator="in" />
        </filter>

        {/* Soft shadow hugging the lower inner edge of each letter. */}
        <filter id={ids.shade} x="-5%" y="-10%" width="110%" height="130%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="5" />
          <feOffset dy="-7" result="shifted" />
          <feComposite in="SourceAlpha" in2="shifted" operator="out" result="rim" />
          <feFlood floodColor="#2a0a5e" floodOpacity="0.75" />
          <feComposite in2="rim" operator="in" />
        </filter>

        <filter id={ids.glow} x="-10%" y="-30%" width="120%" height="160%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      {/* 1. Glow */}
      <text
        {...textProps}
        className="wordmark-text wordmark-glow"
        stroke="#ff2fc8"
        strokeWidth="18"
        strokeLinejoin="round"
        fill="#ff2fc8"
        filter={`url(#${ids.glow})`}
      >
        {text}
      </text>

      {/* 2. Pink outline (sits outside the chrome because the fill is drawn on top) */}
      <text
        {...textProps}
        stroke={`url(#${ids.outline})`}
        strokeWidth="13"
        strokeLinejoin="round"
        fill="#ff2fc8"
      >
        {text}
      </text>

      {/* 3. Chrome */}
      <g clipPath={`url(#${ids.letters})`}>
        <g className="wordmark-chrome-drift">
          <rect
            x="-60"
            y="20"
            width="1120"
            height="220"
            fill={`url(#${ids.chrome})`}
            filter={`url(#${ids.warp})`}
          />
        </g>
      </g>

      {/* 4. Volume */}
      <text {...textProps} fill="#000" filter={`url(#${ids.shade})`}>
        {text}
      </text>
      <text {...textProps} fill="#fff" filter={`url(#${ids.bevel})`} className="wordmark-text wordmark-bevel">
        {text}
      </text>
    </svg>
  );
}
