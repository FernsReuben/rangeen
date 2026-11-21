import { usePrefersReducedMotion } from "../../hooks/use-prefers-reduced-motion.ts";
import { ChromeWordmark } from "./chrome-wordmark.tsx";
import { IridescentBlob } from "./iridescent-blob.tsx";
import "./title-screen.css";

interface TitleScreenProps {
  /** Element id the scroll cue moves to. */
  nextSectionId: string;
}

export function TitleScreen({ nextSectionId }: TitleScreenProps) {
  const reducedMotion = usePrefersReducedMotion();

  const goToNextSection = () => {
    document.getElementById(nextSectionId)?.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
    });
  };

  return (
    <section className="title-screen" aria-labelledby="title-screen-heading">
      <IridescentBlob />

      <div className="title-lockup">
        <h1 id="title-screen-heading" className="title-heading">
          <span className="visually-hidden">Rangeen</span>
          <ChromeWordmark text="RANGEEN" />
        </h1>
        <p className="title-tagline">color tool.</p>
      </div>

      <button type="button" className="scroll-cue" onClick={goToNextSection}>
        <span className="visually-hidden">Enter the studio</span>
        <svg viewBox="0 0 120 40" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id="scroll-cue-gradient" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#3d4bff" />
              <stop offset="1" stopColor="#ff4fd8" />
            </linearGradient>
          </defs>
          <path
            d="M8 10 L60 30 L112 10"
            fill="none"
            stroke="url(#scroll-cue-gradient)"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </section>
  );
}
