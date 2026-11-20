"use client";

import React, { useEffect, useRef, useState, useCallback, useImperativeHandle, forwardRef } from "react";
import { TOTAL_FRAMES, BRAND_NAME } from "@/lib/stages";

export interface FrameCanvasHandle {
  setFrame: (frameIdx: number) => void;
  drawImmediate: (frameIdx: number) => void;
  preloadWindow: (centerIdx: number) => void;
  drawCrossfade: (frameA: number, frameB: number, progress: number) => void;
  setIsPlaying: (isPlaying: boolean) => void;
}

interface FrameCanvasProps {
  onInitialFrameLoaded?: () => void;
  onLoadingProgress?: (progress: number) => void;
  onFirstFrameDrawn?: (stageIndex: number) => void;
}

export const FrameCanvas = forwardRef<FrameCanvasHandle, FrameCanvasProps>(function FrameCanvas(
  { onInitialFrameLoaded, onLoadingProgress, onFirstFrameDrawn },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  
  // Sliding window map of decoded frames
  const decodedWindowRef = useRef<Map<number, ImageBitmap | HTMLImageElement>>(new Map());
  const pendingDecodesRef = useRef<Set<number>>(new Set());

  const [initialFrameReady, setInitialFrameReady] = useState(false);
  const isLowEndDevice = useRef<boolean>(false);
  const isCancelledRef = useRef<boolean>(false);

  // Playback state to control smoothing: "low" during playback, "high" when held
  const isPlayingRef = useRef<boolean>(false);

  // Crossfade state
  const crossfadeStateRef = useRef<{
    frameA: number;
    frameB: number;
    alpha: number;
  } | null>(null);

  // Frame index stored in ref, NOT in React state
  const currentFrameIdxRef = useRef<number>(0);
  const lastDrawnFrameIdxRef = useRef<number>(-1);
  const lastPurgeCenterRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);

  const onLoadingProgressRef = useRef(onLoadingProgress);
  const onInitialFrameLoadedRef = useRef(onInitialFrameLoaded);
  const onFirstFrameDrawnRef = useRef(onFirstFrameDrawn);

  useEffect(() => {
    onLoadingProgressRef.current = onLoadingProgress;
  }, [onLoadingProgress]);

  useEffect(() => {
    onInitialFrameLoadedRef.current = onInitialFrameLoaded;
  }, [onInitialFrameLoaded]);

  useEffect(() => {
    onFirstFrameDrawnRef.current = onFirstFrameDrawn;
  }, [onFirstFrameDrawn]);

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.hardwareConcurrency < 4) {
      isLowEndDevice.current = true;
    }
  }, []);

  const getFrameUrl = useCallback((index: number) => {
    const padIndex = String(index).padStart(3, "0");
    return `/frames/frame_${padIndex}.jpg`;
  }, []);

  // Helper to decode a single frame
  const decodeSingleFrame = useCallback(
    async (index: number): Promise<ImageBitmap | HTMLImageElement | null> => {
      const url = getFrameUrl(index);

      if (typeof window !== "undefined" && "createImageBitmap" in window) {
        try {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          const bitmap = await createImageBitmap(blob);
          return bitmap;
        } catch {}
      }

      return new Promise<HTMLImageElement | null>((resolve) => {
        const img = new Image();
        img.src = url;
        img.onload = async () => {
          if ("decode" in img) {
            try {
              await img.decode();
            } catch {}
          }
          resolve(img);
        };
        img.onerror = () => resolve(null);
      });
    },
    [getFrameUrl]
  );

  /**
   * MEMORY: Asymmetric forward-biased sliding window
   * Pre-fetches 45 frames ahead and keeps 15 frames behind to ensure end-of-stage frames
   * are already fully decoded into GPU memory before playback arrives.
   * Eviction runs throttled every 8 frames so garbage collection doesn't stutter the end-frames.
   */
  const updateSlidingWindow = useCallback(
    (centerIndex: number, direction: number = 1) => {
      if (isCancelledRef.current) return;

      const lookAhead = direction >= 0 ? 45 : 20;
      const lookBehind = direction >= 0 ? 15 : 45;

      const minIndex = Math.max(0, centerIndex - lookBehind);
      const maxIndex = Math.min(TOTAL_FRAMES - 1, centerIndex + lookAhead);

      // Throttled eviction: only purge old frames every 8 steps to avoid GC micro-stutter
      if (Math.abs(centerIndex - lastPurgeCenterRef.current) >= 8) {
        lastPurgeCenterRef.current = centerIndex;
        const evictionMin = Math.max(0, centerIndex - 30);
        const evictionMax = Math.min(TOTAL_FRAMES - 1, centerIndex + 60);

        for (const key of Array.from(decodedWindowRef.current.keys())) {
          if (key < evictionMin || key > evictionMax) {
            const item = decodedWindowRef.current.get(key);
            if (item instanceof ImageBitmap) {
              try {
                item.close();
              } catch {}
            }
            decodedWindowRef.current.delete(key);
          }
        }
      }

      // Preload missing frames inside window, prioritizing immediate next frames
      for (let i = minIndex; i <= maxIndex; i++) {
        if (!decodedWindowRef.current.has(i) && !pendingDecodesRef.current.has(i)) {
          pendingDecodesRef.current.add(i);
          decodeSingleFrame(i).then((decoded) => {
            pendingDecodesRef.current.delete(i);
            if (isCancelledRef.current) {
              if (decoded instanceof ImageBitmap) decoded.close();
              return;
            }
            if (decoded) {
              const curCenter = currentFrameIdxRef.current;
              if (i >= curCenter - 35 && i <= curCenter + 65) {
                decodedWindowRef.current.set(i, decoded);
                if (i === currentFrameIdxRef.current) {
                  executeDraw(i);
                }
              } else if (decoded instanceof ImageBitmap) {
                decoded.close();
              }
            }
          });
        }
      }
    },
    [decodeSingleFrame]
  );

  // Draw single image covering canvas
  const drawImageCover = (
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    img: ImageBitmap | HTMLImageElement,
    alpha: number = 1
  ) => {
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    const naturalWidth = img instanceof ImageBitmap ? img.width : img.naturalWidth;
    const naturalHeight = img instanceof ImageBitmap ? img.height : img.naturalHeight;
    if (!naturalWidth || !naturalHeight) return;

    const imgRatio = naturalWidth / naturalHeight;
    const canvasRatio = canvasWidth / canvasHeight;

    let drawWidth = canvasWidth;
    let drawHeight = canvasHeight;

    if (canvasRatio > imgRatio) {
      drawWidth = canvasWidth;
      drawHeight = canvasWidth / imgRatio;
    } else {
      drawHeight = canvasHeight;
      drawWidth = canvasHeight * imgRatio;
    }

    drawWidth *= 1.04;
    drawHeight *= 1.04;

    const drawX = (canvasWidth - drawWidth) / 2;
    const drawY = (canvasHeight - drawHeight) / 2;

    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha;
    ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
    ctx.globalAlpha = prevAlpha;
  };

  // Canvas drawing routine
  const executeDraw = useCallback((frameIdx: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = isPlayingRef.current ? "low" : "high";

    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    let targetIdx = Math.max(0, Math.min(frameIdx, TOTAL_FRAMES - 1));

    if (isLowEndDevice.current) {
      targetIdx = Math.round(targetIdx / 2) * 2;
      if (targetIdx >= TOTAL_FRAMES) targetIdx = TOTAL_FRAMES - 1;
    }

    // Check if in crossfade mode at stage boundary
    const crossfade = crossfadeStateRef.current;
    if (crossfade && crossfade.alpha > 0 && crossfade.alpha < 1) {
      const imgA = decodedWindowRef.current.get(crossfade.frameA);
      const imgB = decodedWindowRef.current.get(crossfade.frameB);

      if (imgA || imgB) {
        ctx.clearRect(0, 0, canvasWidth, canvasHeight);
        if (imgA) drawImageCover(ctx, canvas, imgA, 1 - crossfade.alpha);
        if (imgB) drawImageCover(ctx, canvas, imgB, crossfade.alpha);
        lastDrawnFrameIdxRef.current = targetIdx;
      }
      return;
    }

    // Normal single-frame draw
    let img = decodedWindowRef.current.get(targetIdx);
    if (!img) {
      // Find closest decoded frame in window
      let closestIdx = -1;
      let minDistance = Infinity;
      for (const k of decodedWindowRef.current.keys()) {
        const dist = Math.abs(k - targetIdx);
        if (dist < minDistance) {
          minDistance = dist;
          closestIdx = k;
        }
      }
      if (closestIdx !== -1) {
        img = decodedWindowRef.current.get(closestIdx);
      }
    }

    if (img) {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      drawImageCover(ctx, canvas, img, 1);
      lastDrawnFrameIdxRef.current = targetIdx;
    }
  }, []);

  const scheduleDraw = useCallback(() => {
    if (rafIdRef.current !== null) return;

    rafIdRef.current = requestAnimationFrame(() => {
      rafIdRef.current = null;
      const targetFrame = currentFrameIdxRef.current;
      if (targetFrame !== lastDrawnFrameIdxRef.current || crossfadeStateRef.current !== null) {
        executeDraw(targetFrame);
      }
    });
  }, [executeDraw]);

  useImperativeHandle(
    ref,
    () => ({
      setFrame: (frameIdx: number) => {
        const whole = Math.round(frameIdx);
        if (whole !== currentFrameIdxRef.current) {
          const dir = whole >= currentFrameIdxRef.current ? 1 : -1;
          currentFrameIdxRef.current = whole;
          updateSlidingWindow(whole, dir);
          scheduleDraw();
        }
      },
      drawImmediate: (frameIdx: number) => {
        const whole = Math.round(frameIdx);
        currentFrameIdxRef.current = whole;
        crossfadeStateRef.current = null;
        updateSlidingWindow(whole);
        executeDraw(whole);
      },
      preloadWindow: (centerIdx: number) => {
        updateSlidingWindow(centerIdx, 1);
      },
      drawCrossfade: (frameA: number, frameB: number, progress: number) => {
        crossfadeStateRef.current = {
          frameA,
          frameB,
          alpha: Math.max(0, Math.min(1, progress)),
        };
        scheduleDraw();
      },
      setIsPlaying: (isPlaying: boolean) => {
        isPlayingRef.current = isPlaying;
        if (!isPlaying) {
          executeDraw(currentFrameIdxRef.current);
        }
      },
    }),
    [executeDraw, scheduleDraw, updateSlidingWindow]
  );

  // Resize canvas backing store strictly once on window resize
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const updateCanvasSize = () => {
      const rect = canvas.getBoundingClientRect();
      const isMobile = window.innerWidth < 768;
      const rawDpr = window.devicePixelRatio || 1;
      const dprCap = isMobile ? 1 : 1.5;
      const dpr = Math.min(Math.max(rawDpr, 1), dprCap);

      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);

      executeDraw(currentFrameIdxRef.current);
    };

    updateCanvasSize();
    window.addEventListener("resize", updateCanvasSize);
    return () => window.removeEventListener("resize", updateCanvasSize);
  }, [executeDraw]);

  // Initial mount: decode frame 0 and initialize sliding window
  useEffect(() => {
    isCancelledRef.current = false;

    decodeSingleFrame(0).then((frame0) => {
      if (frame0 && !isCancelledRef.current) {
        decodedWindowRef.current.set(0, frame0);
        setInitialFrameReady(true);
        onInitialFrameLoadedRef.current?.();
        executeDraw(0);
        updateSlidingWindow(0, 1);
      } else {
        setInitialFrameReady(true);
      }
    });

    return () => {
      isCancelledRef.current = true;
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
      for (const item of decodedWindowRef.current.values()) {
        if (item instanceof ImageBitmap) {
          try {
            item.close();
          } catch {}
        }
      }
      decodedWindowRef.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={`${BRAND_NAME} school backpack, placed on a desk, opened to reveal pens, and opened again to reveal a laptop and notebooks.`}
      className={`w-full h-full block will-change-transform transition-opacity duration-700 ease-out ${
        initialFrameReady ? "opacity-100" : "opacity-0"
      }`}
    />
  );
});
