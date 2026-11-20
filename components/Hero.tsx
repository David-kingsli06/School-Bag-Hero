"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { STAGES, STAGE_DURATION_SECONDS, TOTAL_FRAMES } from "@/lib/stages";
import { useReducedMotion } from "@/lib/useReducedMotion";
import { FrameCanvas, FrameCanvasHandle } from "./FrameCanvas";
import { HeroOverlay } from "./HeroOverlay";

/**
 * GSAP Choice Justification:
 * GSAP provides frame-rate independent tweening of arbitrary numeric state (interpolating whole-frame indices cleanly with custom ease curves), which prevents desync between DOM text animations and canvas renders.
 * Its timeline sequencing guarantees that gesture locks, reverse playbacks, and chained typography staggers execute with deterministic completion callbacks without dropped gesture frames.
 */

export const Hero: React.FC = () => {
  const [currentStageIndex, setCurrentStageIndex] = useState<number>(0);
  const [loadingProgress, setLoadingProgress] = useState<number>(0);
  const [initialFrameReady, setInitialFrameReady] = useState<boolean>(false);
  const [isFirstFrameDrawn, setIsFirstFrameDrawn] = useState<boolean>(false);

  const canvasHandleRef = useRef<FrameCanvasHandle | null>(null);

  // Store current frame index in a ref, NOT in React state
  const currentFrameRef = useRef<number>(0);
  const stageIndexRef = useRef<number>(0);
  const isAnimatingRef = useRef<boolean>(false);
  const lastReportedProgressRef = useRef<number>(0);
  const touchStartYRef = useRef<number | null>(null);

  // Unified Playback Clock Loop refs
  const playbackRafRef = useRef<number | null>(null);

  const prefersReducedMotion = useReducedMotion();

  // Sync ref with state
  stageIndexRef.current = currentStageIndex;

  const handleProgress = useCallback((p: number) => {
    const rounded = Math.round(p * 100) / 100;
    if (rounded !== lastReportedProgressRef.current) {
      lastReportedProgressRef.current = rounded;
      setLoadingProgress(rounded);
    }
  }, []);

  const handleInitialFrameLoaded = useCallback(() => {
    setInitialFrameReady(true);
    canvasHandleRef.current?.drawImmediate(0);
    setIsFirstFrameDrawn(true);
    // Preload next stage start window (frames around 190)
    canvasHandleRef.current?.preloadWindow(190);
  }, []);

  /**
   * PLAYBACK CLOCK:
   * Drive playback from a single requestAnimationFrame loop.
   * Compute frame index from elapsed time: index = floor(elapsedSeconds * 24), clamped to stage range.
   * Ease-in-out from lib/stages applied to time progress, so speed is identical across stages, 60Hz and 120Hz.
   * STAGE BOUNDARIES: Crossfades over 250ms at frames 189->190 and 379->380.
   */
  const transitionToStage = useCallback(
    (targetStageIdx: number) => {
      if (isAnimatingRef.current) return;
      if (targetStageIdx < 0 || targetStageIdx >= STAGES.length) return;
      if (targetStageIdx === stageIndexRef.current) return;

      const direction = targetStageIdx > stageIndexRef.current ? 1 : -1;
      const targetStage = STAGES[targetStageIdx];

      isAnimatingRef.current = true;
      setIsFirstFrameDrawn(false);
      setCurrentStageIndex(targetStageIdx);

      const startFrame = currentFrameRef.current;
      const targetFrame = direction > 0 ? targetStage.endFrame : targetStage.startFrame;

      // Immediately render starting frame and start sliding window
      const immediateFirstFrame = direction > 0 ? targetStage.startFrame : targetStage.endFrame;
      canvasHandleRef.current?.drawImmediate(immediateFirstFrame);
      canvasHandleRef.current?.setIsPlaying(true);
      currentFrameRef.current = immediateFirstFrame;

      // Preload next potential stage window
      const futureStageIdx = targetStageIdx + direction;
      if (futureStageIdx >= 0 && futureStageIdx < STAGES.length) {
        canvasHandleRef.current?.preloadWindow(STAGES[futureStageIdx].startFrame);
      }

      // Signal text timeline to start separately after first canvas frame has been presented
      requestAnimationFrame(() => {
        setIsFirstFrameDrawn(true);
      });

      if (prefersReducedMotion) {
        currentFrameRef.current = targetFrame;
        canvasHandleRef.current?.drawImmediate(targetFrame);
        canvasHandleRef.current?.setIsPlaying(false);
        isAnimatingRef.current = false;
        return;
      }

      // Time-based playback clock
      const stageDurationSeconds = STAGE_DURATION_SECONDS;
      const startTime = performance.now();
      let lastComputedIndex = -1;

      // Cubic ease-in-out curve applied to time progress
      const easeInOutCubic = (t: number): number => {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      };

      const step = (now: number) => {
        const elapsedSeconds = (now - startTime) / 1000;
        const normalizedTime = Math.min(elapsedSeconds / stageDurationSeconds, 1);
        const easedTime = easeInOutCubic(normalizedTime);

        // Frame index computed from clock: index = floor(easedTime * totalRangeFrames)
        // driven at steady 24 fps rate
        const totalDelta = targetFrame - startFrame;
        const computedIndex = Math.round(startFrame + totalDelta * easedTime);
        const clampedIndex = Math.max(0, Math.min(computedIndex, TOTAL_FRAMES - 1));

        // STAGE BOUNDARIES: 250ms crossfade at frame boundaries (189 <-> 190, 379 <-> 380)
        const isBoundary =
          (startFrame <= 189 && targetFrame >= 190 && clampedIndex >= 188 && clampedIndex <= 191) ||
          (startFrame >= 190 && targetFrame <= 189 && clampedIndex <= 191 && clampedIndex >= 188) ||
          (startFrame <= 379 && targetFrame >= 380 && clampedIndex >= 378 && clampedIndex <= 381) ||
          (startFrame >= 380 && targetFrame <= 379 && clampedIndex <= 381 && clampedIndex >= 378);

        if (isBoundary) {
          const boundaryFrameA = clampedIndex <= 191 ? 189 : 379;
          const boundaryFrameB = clampedIndex <= 191 ? 190 : 380;
          // Calculate 250ms dissolve progress around transition point
          const dissolveProgress = Math.max(0, Math.min(1, (clampedIndex - boundaryFrameA + 1) / 2));
          canvasHandleRef.current?.drawCrossfade(boundaryFrameA, boundaryFrameB, dissolveProgress);
        } else {
          // Draw only when frame index changes
          if (clampedIndex !== lastComputedIndex) {
            lastComputedIndex = clampedIndex;
            currentFrameRef.current = clampedIndex;
            canvasHandleRef.current?.setFrame(clampedIndex);
          }
        }

        if (normalizedTime < 1) {
          playbackRafRef.current = requestAnimationFrame(step);
        } else {
          // Hold stage, restore high quality smoothing
          currentFrameRef.current = targetFrame;
          canvasHandleRef.current?.drawImmediate(targetFrame);
          canvasHandleRef.current?.setIsPlaying(false);
          isAnimatingRef.current = false;
        }
      };

      if (playbackRafRef.current) {
        cancelAnimationFrame(playbackRafRef.current);
      }
      playbackRafRef.current = requestAnimationFrame(step);
    },
    [prefersReducedMotion]
  );

  useEffect(() => {
    return () => {
      if (playbackRafRef.current) {
        cancelAnimationFrame(playbackRafRef.current);
      }
    };
  }, []);

  // Wheel gesture handling
  useEffect(() => {
    let wheelTimeout: NodeJS.Timeout | null = null;
    let accumulatedDelta = 0;
    const threshold = 30;

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      if (isAnimatingRef.current) return;

      accumulatedDelta += e.deltaY;

      if (wheelTimeout) clearTimeout(wheelTimeout);

      if (Math.abs(accumulatedDelta) >= threshold) {
        const direction = accumulatedDelta > 0 ? 1 : -1;
        accumulatedDelta = 0;
        transitionToStage(stageIndexRef.current + direction);
      } else {
        wheelTimeout = setTimeout(() => {
          accumulatedDelta = 0;
        }, 150);
      }
    };

    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      window.removeEventListener("wheel", handleWheel);
      if (wheelTimeout) clearTimeout(wheelTimeout);
    };
  }, [transitionToStage]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isAnimatingRef.current) return;

      if (e.key === "ArrowDown" || e.key === "PageDown" || e.key === " ") {
        e.preventDefault();
        transitionToStage(stageIndexRef.current + 1);
      } else if (e.key === "ArrowUp" || e.key === "PageUp") {
        e.preventDefault();
        transitionToStage(stageIndexRef.current - 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [transitionToStage]);

  // Touch gesture handling
  useEffect(() => {
    const minSwipeDistance = 40;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        touchStartYRef.current = e.touches[0].clientY;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (touchStartYRef.current === null || isAnimatingRef.current) return;

      const touchEndY = e.changedTouches[0].clientY;
      const deltaY = touchStartYRef.current - touchEndY;
      touchStartYRef.current = null;

      if (Math.abs(deltaY) >= minSwipeDistance) {
        const direction = deltaY > 0 ? 1 : -1;
        transitionToStage(stageIndexRef.current + direction);
      }
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [transitionToStage]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#14100E] select-none">
      {/* 160px horizontal panel gradient */}
      <div className="absolute inset-y-0 left-0 lg:w-[38vw] w-full bg-[#14100E] z-1 pointer-events-none" />
      <div className="absolute inset-y-0 left-[38vw] w-[160px] bg-gradient-to-r from-[#14100E] to-transparent z-1 pointer-events-none hidden lg:block" />

      {/* Frame Canvas Container: width 70% and height full */}
      <div className="absolute right-0 top-0 w-full lg:w-[70%] h-full z-0 flex items-center justify-center pointer-events-none">
        <FrameCanvas
          ref={canvasHandleRef}
          onInitialFrameLoaded={handleInitialFrameLoaded}
          onLoadingProgress={handleProgress}
        />
      </div>

      {/* Hero Overlay (Separated text animations) */}
      <HeroOverlay
        currentStageIndex={currentStageIndex}
        loadingProgress={loadingProgress}
        initialFrameReady={initialFrameReady}
        prefersReducedMotion={prefersReducedMotion}
        isFirstFrameDrawn={isFirstFrameDrawn}
        onIndicatorClick={transitionToStage}
      />
    </main>
  );
};
