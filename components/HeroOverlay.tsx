"use client";

import React, { useEffect, useRef } from "react";
import gsap from "gsap";
import { STAGES, StageData, BRAND_NAME } from "@/lib/stages";

interface HeroOverlayProps {
  currentStageIndex: number;
  loadingProgress: number;
  initialFrameReady: boolean;
  prefersReducedMotion: boolean;
  isFirstFrameDrawn: boolean;
  onIndicatorClick?: (index: number) => void;
}

export const HeroOverlay: React.FC<HeroOverlayProps> = ({
  currentStageIndex,
  loadingProgress,
  initialFrameReady,
  prefersReducedMotion,
  isFirstFrameDrawn,
  onIndicatorClick,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const stageRefs = useRef<(HTMLDivElement | null)[]>([]);
  const counterRef = useRef<HTMLSpanElement | null>(null);
  const scrollCueRef = useRef<HTMLDivElement | null>(null);
  const prevStageIndexRef = useRef<number>(currentStageIndex);
  const currentTimelineRef = useRef<gsap.core.Timeline | null>(null);

  // Stage counter: cross-fade number over 400ms when it changes
  useEffect(() => {
    if (!counterRef.current) return;
    const stageNumStr = `0${currentStageIndex + 1}`;

    if (prefersReducedMotion) {
      counterRef.current.textContent = stageNumStr;
      return;
    }

    gsap.to(counterRef.current, {
      opacity: 0,
      duration: 0.2,
      ease: "power2.inOut",
      onComplete: () => {
        if (counterRef.current) {
          counterRef.current.textContent = stageNumStr;
          gsap.to(counterRef.current, {
            opacity: 1,
            duration: 0.2,
            ease: "power2.inOut",
          });
        }
      },
    });
  }, [currentStageIndex, prefersReducedMotion]);

  // Hide scroll cue once moving past Stage 1
  useEffect(() => {
    if (currentStageIndex > 0 && scrollCueRef.current) {
      gsap.to(scrollCueRef.current, {
        opacity: 0,
        duration: 0.4,
        ease: "power2.out",
        onComplete: () => {
          if (scrollCueRef.current) scrollCueRef.current.style.display = "none";
        },
      });
    }
  }, [currentStageIndex]);

  // Stage transition management
  useEffect(() => {
    if (!isFirstFrameDrawn) return;

    const prevIdx = prevStageIndexRef.current;
    const nextIdx = currentStageIndex;

    const prevEl = stageRefs.current[prevIdx];
    const nextEl = stageRefs.current[nextIdx];

    if (currentTimelineRef.current) {
      currentTimelineRef.current.kill();
    }

    if (prevIdx === nextIdx) {
      // First mount entrance
      if (nextEl) {
        animateStageIn(nextEl, prefersReducedMotion);
      }
      return;
    }

    prevStageIndexRef.current = nextIdx;

    if (prefersReducedMotion) {
      if (prevEl) {
        gsap.set(prevEl, { display: "none", opacity: 0 });
      }
      if (nextEl) {
        gsap.set(nextEl, { display: "flex", opacity: 1 });
        const animElements = nextEl.querySelectorAll(
          ".anim-eyebrow, .anim-word, .anim-subline, .anim-accent-line, .anim-spec"
        );
        gsap.set(animElements, {
          opacity: 1,
          y: 0,
          filter: "none",
          scaleX: 1,
          transform: "none",
        });
      }
      return;
    }

    // Exit old stage, enter new stage
    if (prevEl) {
      animateStageOut(prevEl, () => {
        gsap.set(prevEl, { display: "none" });
        if (nextEl) {
          gsap.set(nextEl, { display: "flex" });
          animateStageIn(nextEl, false);
        }
      });
    } else if (nextEl) {
      gsap.set(nextEl, { display: "flex" });
      animateStageIn(nextEl, false);
    }
  }, [currentStageIndex, isFirstFrameDrawn, prefersReducedMotion]);

  /**
   * Animation order per stage:
   *  - eyebrow (0 ms)
   *  - headline words (150 ms, staggered by 90 ms)
   *  - accent rule (after headline)
   *  - subline (300 ms after rule)
   *  - spec row (200 ms after subline)
   */
  const animateStageIn = (element: HTMLElement, reduced: boolean) => {
    const eyebrow = element.querySelector<HTMLElement>(".anim-eyebrow");
    const words = element.querySelectorAll<HTMLElement>(".anim-word");
    const accentLine = element.querySelector<HTMLElement>(".anim-accent-line");
    const subline = element.querySelector<HTMLElement>(".anim-subline");
    const specs = element.querySelectorAll<HTMLElement>(".anim-spec");

    if (reduced) {
      gsap.set(element, { opacity: 1, display: "flex" });
      if (eyebrow) gsap.set(eyebrow, { opacity: 1, y: 0, filter: "none" });
      gsap.set(words, { opacity: 1, y: 0, filter: "none", transform: "none" });
      if (accentLine) gsap.set(accentLine, { opacity: 1, scaleX: 1, filter: "none" });
      if (subline) gsap.set(subline, { opacity: 1, y: 0, filter: "none" });
      gsap.set(specs, { opacity: 0.7, y: 0, filter: "none" });
      return;
    }

    // Reset initial states - ensure filter is explicitly cleared for elements that do not use blur
    gsap.set(element, { opacity: 1, display: "flex" });
    if (eyebrow) {
      gsap.set(eyebrow, { opacity: 0, y: 12, filter: "none" });
    }
    gsap.set(words, {
      y: 24,
      opacity: 0,
      filter: "blur(8px)",
    });
    if (accentLine) {
      gsap.set(accentLine, {
        scaleX: 0,
        transformOrigin: "left center",
        opacity: 0,
        filter: "none",
      });
    }
    if (subline) {
      gsap.set(subline, { opacity: 0, y: 0, filter: "none" });
    }
    if (specs.length > 0) {
      gsap.set(specs, { opacity: 0, y: 10, filter: "none" });
    }

    const tl = gsap.timeline();
    currentTimelineRef.current = tl;

    // Eyebrow (0 ms)
    if (eyebrow) {
      tl.to(
        eyebrow,
        {
          opacity: 1,
          y: 0,
          filter: "none",
          duration: 0.6,
          ease: "power2.out",
        },
        0
      );
    }

    // Headline words (150 ms, staggered by 90 ms)
    if (words.length > 0) {
      tl.to(
        words,
        {
          y: 0,
          opacity: 1,
          filter: "blur(0px)",
          duration: 0.9,
          stagger: 0.09,
          ease: "power3.out",
        },
        0.15
      );
    }

    // Accent rule (after headline)
    if (accentLine) {
      tl.to(
        accentLine,
        {
          scaleX: 1,
          opacity: 1,
          filter: "none",
          duration: 0.7,
          ease: "power2.out",
        },
        ">"
      );
    }

    // Subline (300 ms after rule starts): ensure filter: "none" is enforced cleanly
    if (subline) {
      tl.to(
        subline,
        {
          opacity: 1,
          filter: "none",
          duration: 0.7,
          ease: "power2.out",
        },
        "<0.3"
      );
    }

    // Spec row (200 ms after subline starts): ensure filter: "none" is enforced cleanly
    if (specs.length > 0) {
      tl.to(
        specs,
        {
          opacity: 0.7,
          y: 0,
          filter: "none",
          duration: 0.6,
          stagger: 0.08,
          ease: "power2.out",
        },
        "<0.2"
      );
    }
  };

  /**
   * Exit: All elements fade out and drift upward.
   * Blur filter is restricted only to headline words on exit, so subline and specs stay crisp.
   */
  const animateStageOut = (element: HTMLElement, onComplete: () => void) => {
    const eyebrow = element.querySelector<HTMLElement>(".anim-eyebrow");
    const words = element.querySelectorAll<HTMLElement>(".anim-word");
    const accentLine = element.querySelector<HTMLElement>(".anim-accent-line");
    const subline = element.querySelector<HTMLElement>(".anim-subline");
    const specs = element.querySelectorAll<HTMLElement>(".anim-spec");

    const tl = gsap.timeline({ onComplete });
    currentTimelineRef.current = tl;

    if (eyebrow) {
      tl.to(
        eyebrow,
        {
          y: -12,
          opacity: 0,
          duration: 0.4,
          ease: "power2.in",
        },
        0
      );
    }

    if (words.length > 0) {
      tl.to(
        words,
        {
          y: -12,
          opacity: 0,
          filter: "blur(4px)",
          duration: 0.5,
          ease: "power2.in",
        },
        0
      );
    }

    if (accentLine) {
      tl.to(
        accentLine,
        {
          opacity: 0,
          duration: 0.3,
          ease: "power2.in",
        },
        0
      );
    }

    if (subline) {
      tl.to(
        subline,
        {
          y: -12,
          opacity: 0,
          duration: 0.45,
          ease: "power2.in",
        },
        0
      );
    }

    if (specs.length > 0) {
      tl.to(
        specs,
        {
          y: -12,
          opacity: 0,
          duration: 0.45,
          ease: "power2.in",
        },
        0
      );
    }
  };

  // Helper to split text into words and detect italic markers like *word*
  const renderSplitHeadline = (text: string) => {
    return text.split(" ").map((token, idx, arr) => {
      const isItalic = token.startsWith("*") && token.endsWith("*");
      const word = isItalic ? token.slice(1, -1) : token;

      return (
        <span key={idx} className="inline-block whitespace-nowrap">
          <span
            className={`anim-word inline-block will-change-[transform,opacity,filter] ${
              isItalic ? "italic font-normal" : ""
            }`}
          >
            {word}
          </span>
          {idx < arr.length - 1 ? "\u00A0" : ""}
        </span>
      );
    });
  };

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none select-none z-10 flex flex-col justify-between"
    >
      {/* Subtle hairline loading progress bar at the very top */}
      {loadingProgress < 1 && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-black/40 z-30">
          <div
            className="h-full bg-[var(--accent-color)] transition-all duration-300 ease-out"
            style={{ width: `${Math.round(loadingProgress * 100)}%` }}
          />
        </div>
      )}

      {/* Top Header: Counter */}
      <header className="w-full flex justify-end items-center pt-8 pr-[6vw] z-20">
        <div className="font-sans text-[14px] tracking-[0.2em] text-[#F3EDE3]/70 font-medium select-none">
          <span ref={counterRef}>01</span>
          <span> / 04</span>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="relative flex-1 flex items-center px-[6vw] max-lg:pt-6 max-lg:items-start max-lg:h-[40vh]">
        {/* Stage Indicator: vertical list of 4 markers on the left edge */}
        <div className="mr-8 hidden sm:flex flex-col gap-3 py-2 z-20 pointer-events-auto">
          {STAGES.map((s, idx) => {
            const isActive = idx === currentStageIndex;
            return (
              <button
                key={s.id}
                onClick={() => onIndicatorClick?.(idx)}
                aria-label={`Jump to stage ${idx + 1}`}
                className={`w-[2px] rounded-full transition-all duration-500 ease-out ${
                  isActive
                    ? "h-[24px] bg-[var(--accent-color)] opacity-100"
                    : "h-[8px] bg-[#F3EDE3] opacity-30 hover:opacity-60"
                }`}
              />
            );
          })}
        </div>

        {/* Text Container */}
        <div className="relative lg:w-[38vw] w-full flex flex-col justify-center">
          {STAGES.map((stage: StageData, index: number) => {
            const isInitial = index === 0;
            return (
              <div
                key={stage.id}
                ref={(el) => {
                  stageRefs.current[index] = el;
                }}
                style={{ display: isInitial ? "flex" : "none" }}
                className="flex-col gap-4 w-full absolute inset-x-0"
              >
                {/* Eyebrow label */}
                <div className="anim-eyebrow font-sans text-[12px] uppercase tracking-[0.24em] font-medium text-[var(--accent-color)]">
                  {stage.eyebrow}
                </div>

                {stage.isWordmark ? (
                  /* Stage 4: Wordmark */
                  <div className="flex flex-col gap-4">
                    <p className="font-serif text-[64px] lg:text-[96px] leading-[1.0] text-[#F3EDE3] font-semibold tracking-[-0.01em]">
                      {renderSplitHeadline(BRAND_NAME)}
                    </p>
                    <div className="anim-accent-line h-[1px] w-16 bg-[var(--accent-color)] opacity-80 will-change-[transform,opacity]" />
                    <p className="anim-subline font-sans text-[16px] lg:text-[18px] leading-[1.5] text-[#C8843A] max-w-[32rem]">
                      {stage.subline}
                    </p>
                  </div>
                ) : (
                  /* Stage 1, 2, 3: Headlines */
                  <div className="flex flex-col gap-4">
                    {index === 0 ? (
                      <h1 className="font-serif text-[42px] sm:text-[52px] lg:text-[72px] leading-[1.08] text-[#F3EDE3] font-medium tracking-[-0.01em] flex flex-wrap">
                        {stage.headline && renderSplitHeadline(stage.headline)}
                      </h1>
                    ) : (
                      <h2 className="font-serif text-[42px] sm:text-[52px] lg:text-[72px] leading-[1.08] text-[#F3EDE3] font-medium tracking-[-0.01em] flex flex-wrap">
                        {stage.headline && renderSplitHeadline(stage.headline)}
                      </h2>
                    )}

                    {/* Accent rule */}
                    <div className="anim-accent-line h-[1px] w-12 bg-[var(--accent-color)] opacity-80 will-change-[transform,opacity]" />

                    {/* Subline */}
                    <p className="anim-subline font-sans text-[16px] lg:text-[18px] leading-[1.5] text-[#C8843A] max-w-[30rem]">
                      {stage.subline}
                    </p>
                  </div>
                )}

                {/* Spec row */}
                {stage.specs && stage.specs.length > 0 && (
                  <div className="mt-3 flex items-center gap-3 font-sans text-[12px] uppercase tracking-wider text-[#F3EDE3]/70">
                    {stage.specs.map((spec, sIdx) => (
                      <React.Fragment key={sIdx}>
                        <span className="anim-spec inline-block">{spec}</span>
                        {sIdx < stage.specs.length - 1 && (
                          <span className="w-[1px] h-3 bg-[#F3EDE3]/25" />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                )}

                {/* Scroll cue below stage 1 */}
                {index === 0 && (
                  <div
                    ref={scrollCueRef}
                    className="mt-4 flex flex-col items-start gap-2 text-[#F3EDE3]/50 text-xs tracking-widest font-sans"
                  >
                    <span className="text-[11px] uppercase tracking-[0.25em]">Scroll to inspect</span>
                    <div className="w-[40px] h-[2px] bg-[var(--accent-color)] animate-pulse-subtle" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <footer className="w-full pb-8 px-[6vw] flex items-center justify-between z-20 text-[12px] font-sans tracking-widest text-[#F3EDE3]/40">
        <span>EST. 2026</span>
        <span>STUDY &amp; TRAVEL</span>
      </footer>
    </div>
  );
};
