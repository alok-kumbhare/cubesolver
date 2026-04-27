import { useEffect, useRef, useState } from 'react';
import type { Faces, Face } from '../cube/model';
import { setSticker, validate } from '../cube/model';
import { FACE_COLORS, COLOR_NAMES, KID_FACE_GUIDE_ORDER, FACE_TOP_NEIGHBOR } from '../cube/theme';
import { IsoCubeIcon } from './IsoCubeIcon';
import { ColorPalette } from './ColorPalette';

// HSV-based classifier mapping a sampled RGB to one of 6 face colors.
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0;
  const v = max;
  const d = max - min;
  const s = max === 0 ? 0 : d / max;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, s, v];
}

interface Classified {
  face: Face;
  confident: boolean; // false if we fell back to nearest-RGB (low-saturation gray, dim, etc.)
}

function classify(r: number, g: number, b: number): Classified {
  const [h, s, v] = rgbToHsv(r, g, b);
  // Whites: very low saturation and bright. Tighter thresholds so a
  // glare-washed colored sticker (which still keeps a small color cast)
  // doesn't get misread as white.
  if (s < 0.18 && v > 0.55) return { face: 'U', confident: true };
  // Yellows: hue 35-72, moderate sat.
  if (h >= 35 && h <= 72 && s > 0.25) return { face: 'D', confident: true };
  // Oranges: hue 5-35.
  if (h >= 5 && h < 35 && s > 0.35) return { face: 'L', confident: true };
  // Reds: hue 0-5 or 335-360.
  if ((h < 5 || h > 335) && s > 0.35) return { face: 'R', confident: true };
  // Greens: hue 72-175, includes more cyan-greens.
  if (h >= 72 && h <= 175 && s > 0.2) return { face: 'F', confident: true };
  // Blues: hue 175-265.
  if (h >= 175 && h <= 265 && s > 0.2) return { face: 'B', confident: true };
  // Fallback: nearest by RGB distance to known palette. Mark as low confidence
  // so the alignment gate rejects the frame.
  let best: Face = 'U';
  let bestD = Infinity;
  for (const f of ['U', 'R', 'F', 'D', 'L', 'B'] as Face[]) {
    const hex = FACE_COLORS[f];
    const rr = parseInt(hex.slice(1, 3), 16);
    const gg = parseInt(hex.slice(3, 5), 16);
    const bb = parseInt(hex.slice(5, 7), 16);
    const d = (r - rr) ** 2 + (g - gg) ** 2 + (b - bb) ** 2;
    if (d < bestD) { bestD = d; best = f; }
  }
  return { face: best, confident: false };
}

function sampleAt(ctx: CanvasRenderingContext2D, cx: number, cy: number, half: number): Classified {
  const data = ctx.getImageData(
    Math.round(cx) - half, Math.round(cy) - half,
    half * 2, half * 2,
  ).data;
  // Glare on a colored sticker creates a bright, near-white specular spot
  // that pulls the channel-mean toward white and makes the sticker look
  // like the W (Up) face. Strategy: drop pixels that look like specular
  // highlights (very bright AND very low saturation) before averaging.
  // If filtering would leave too few pixels (e.g. the sticker really is
  // white), fall back to the unfiltered mean.
  let R = 0, G = 0, B = 0, n = 0;
  let RAll = 0, GAll = 0, BAll = 0, nAll = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    RAll += r; GAll += g; BAll += b; nAll++;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    const v = mx / 255;
    const s = mx === 0 ? 0 : (mx - mn) / mx;
    // Skip blown-out specular pixels.
    if (v > 0.93 && s < 0.18) continue;
    R += r; G += g; B += b; n++;
  }
  if (n < nAll * 0.25) {
    // Too few non-glare pixels — sticker is probably actually white.
    return classify(RAll / nAll, GAll / nAll, BAll / nAll);
  }
  return classify(R / n, G / n, B / n);
}

// Average value (HSV V, max channel / 255) of a small box. Used for the
// cube-presence check (sticker gaps are darker than sticker faces).
function sampleValue(ctx: CanvasRenderingContext2D, cx: number, cy: number, half: number): number {
  const data = ctx.getImageData(
    Math.round(cx) - half, Math.round(cy) - half,
    half * 2, half * 2,
  ).data;
  let total = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    total += Math.max(data[i], data[i + 1], data[i + 2]);
    n++;
  }
  return total / n / 255;
}

interface BBox { x: number; y: number; side: number }

// Find a rough bounding box of the cube in the frame by projecting a
// "saturated cube-color pixel" mask onto the X and Y axes and picking the
// row/column ranges where the projection is significant. Returns the
// largest square that fits the projected extent, recentered on the cube's
// centroid. Returns null if too few cube-like pixels are detected.
//
// Cheap (~one classify() per ~16 px on a downsampled grid) and works
// well as long as the cube is the most colorful thing in the frame.
function detectCubeBBox(
  ctx: CanvasRenderingContext2D, w: number, h: number,
): BBox | null {
  const TARGET = 160;
  const stride = Math.max(1, Math.floor(w / TARGET));
  const SW = Math.floor(w / stride);
  const SH = Math.floor(h / stride);
  const data = ctx.getImageData(0, 0, w, h).data;

  const colCount = new Int32Array(SW);
  const rowCount = new Int32Array(SH);
  let total = 0;
  for (let yy = 0; yy < SH; yy++) {
    const py = yy * stride;
    for (let xx = 0; xx < SW; xx++) {
      const px = xx * stride;
      const i = (py * w + px) * 4;
      const cls = classify(data[i], data[i + 1], data[i + 2]);
      if (cls.confident) {
        colCount[xx]++;
        rowCount[yy]++;
        total++;
      }
    }
  }
  if (total < SW * SH * 0.02) return null;

  let colMax = 0; for (let i = 0; i < SW; i++) if (colCount[i] > colMax) colMax = colCount[i];
  let rowMax = 0; for (let i = 0; i < SH; i++) if (rowCount[i] > rowMax) rowMax = rowCount[i];
  const colThr = Math.max(2, colMax * 0.3);
  const rowThr = Math.max(2, rowMax * 0.3);

  let xmin = -1, xmax = -1, ymin = -1, ymax = -1;
  for (let i = 0; i < SW; i++) if (colCount[i] >= colThr) { if (xmin < 0) xmin = i; xmax = i; }
  for (let i = 0; i < SH; i++) if (rowCount[i] >= rowThr) { if (ymin < 0) ymin = i; ymax = i; }
  if (xmin < 0 || ymin < 0) return null;

  const bx = xmin * stride;
  const by = ymin * stride;
  const bw = (xmax - xmin + 1) * stride;
  const bh = (ymax - ymin + 1) * stride;
  const cx = bx + bw / 2;
  const cy = by + bh / 2;
  // 5% margin so the outermost stickers aren't clipped by a tight bbox.
  let side = Math.max(bw, bh) * 1.05;
  side = Math.min(side, w, h);
  if (side < Math.min(w, h) * 0.10) return null;
  const fx = Math.round(Math.max(0, Math.min(w - side, cx - side / 2)));
  const fy = Math.round(Math.max(0, Math.min(h - side, cy - side / 2)));
  return { x: fx, y: fy, side: Math.round(side) };
}

interface FrameSample {
  cells: Face[];               // 9 classified colors, row-major
  allConfident: boolean;       // every cell hit the HSV thresholds (no nearest-RGB fallback)
  centerFace: Face;            // detected center color (independent of expected)
  cubePresent: boolean;        // bbox detected + dark sticker gaps detected → real cube
  snapshotDataUrl: string;     // PNG data URL of the cropped ROI for "freeze the frame" UX
  bbox: BBox;                  // location of the sampled ROI in canvas coords
  detected: boolean;           // true if bbox came from detection (not the fallback fixed grid)
}

function sampleFace(video: HTMLVideoElement): FrameSample {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d')!;
  // Sample from the un-mirrored camera frame. The canonical face layout
  // (Kociemba's "looking at the face from outside") matches the camera's
  // native point of view, so data[0] is the real top-left sticker. The
  // displayed <video> may be CSS-mirrored (selfie-style) and the grid
  // overlay is mirrored along with it, so the on-screen feedback still
  // lines up with what the user sees.
  ctx.drawImage(video, 0, 0);

  // Try to detect the cube's bounding box automatically. If detection
  // fails, fall back to a fixed centered ROI (legacy behaviour) so the
  // user can still align manually with the on-screen grid.
  const detectedBBox = detectCubeBBox(ctx, canvas.width, canvas.height);
  const fallbackSide = Math.min(canvas.width, canvas.height) * 0.5;
  const bbox: BBox = detectedBBox ?? {
    x: Math.round((canvas.width - fallbackSide) / 2),
    y: Math.round((canvas.height - fallbackSide) / 2),
    side: Math.round(fallbackSide),
  };
  const detected = !!detectedBBox;
  const { x: ox, y: oy, side } = bbox;
  const cell = side / 3;
  const sampleHalf = Math.max(4, Math.floor(cell * 0.18));

  const cells: Face[] = [];
  let confidentCount = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const cx = ox + cell * (c + 0.5);
      const cy = oy + cell * (r + 0.5);
      const cls = sampleAt(ctx, cx, cy, sampleHalf);
      cells.push(cls.face);
      if (cls.confident) confidentCount++;
    }
  }
  // Tolerate up to 2 unconfident cells (lighting glare on a single sticker
  // shouldn't block the whole capture).
  const allConfident = confidentCount >= 7;

  const centerFace = cells[4];

  // ---- Cube-presence check ---------------------------------------------
  // A real Rubik's cube has dark plastic gaps between stickers. Sample the
  // 12 gap midpoints between adjacent cells and compare each gap's
  // brightness to its two flanking sticker centers. Detection alone isn't
  // enough — a colorful poster could yield a plausible bbox.
  const cellValues: number[][] = [];
  const gapHalf = Math.max(2, Math.floor(cell * 0.08));
  for (let r = 0; r < 3; r++) {
    cellValues[r] = [];
    for (let c = 0; c < 3; c++) {
      cellValues[r][c] = sampleValue(ctx, ox + cell * (c + 0.5), oy + cell * (r + 0.5), sampleHalf);
    }
  }
  const GAP_DARKNESS_MIN = 0.12;
  let darkGaps = 0;
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 2; c++) {
      const gx = ox + cell * (c + 1);
      const gy = oy + cell * (r + 0.5);
      const gV = sampleValue(ctx, gx, gy, gapHalf);
      const flank = (cellValues[r][c] + cellValues[r][c + 1]) / 2;
      if (flank - gV >= GAP_DARKNESS_MIN) darkGaps++;
    }
  }
  for (let c = 0; c < 3; c++) {
    for (let r = 0; r < 2; r++) {
      const gx = ox + cell * (c + 0.5);
      const gy = oy + cell * (r + 1);
      const gV = sampleValue(ctx, gx, gy, gapHalf);
      const flank = (cellValues[r][c] + cellValues[r + 1][c]) / 2;
      if (flank - gV >= GAP_DARKNESS_MIN) darkGaps++;
    }
  }
  // Need both detection AND enough dark gaps for a confident "cube present".
  const cubePresent = detected && darkGaps >= 7;

  // Snapshot the ROI so we can freeze-frame on capture.
  const snapCanvas = document.createElement('canvas');
  snapCanvas.width = side;
  snapCanvas.height = side;
  snapCanvas.getContext('2d')!.drawImage(canvas, ox, oy, side, side, 0, 0, side, side);
  const snapshotDataUrl = snapCanvas.toDataURL('image/png');

  return { cells, allConfident, centerFace, cubePresent, snapshotDataUrl, bbox, detected };
}

interface Props {
  faces: Faces;
  onChange: (next: Faces) => void;
  onClose: () => void;
}

export function CameraScanner({ faces, onChange, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [faceIdx, setFaceIdx] = useState(0);
  const [lastDetected, setLastDetected] = useState<Face[] | null>(null);
  const [autoCapture, setAutoCapture] = useState(true);
  const [, setStability] = useState(0);
  const [justCaptured, setJustCaptured] = useState(false);
  const [alignmentMsg, setAlignmentMsg] = useState<string | null>(null);
  const [aligned, setAligned] = useState(false);
  // True when the camera is the user-facing one (or unknown — desktop
  // webcams default to selfie-style mirroring). False for the rear/back
  // camera on phones, where the natural view should not be flipped.
  const [mirror, setMirror] = useState(true);
  // Bbox at capture time, used to position the snapshot + captured-cells
  // overlay so they freeze in place.
  const [capturedBBox, setCapturedBBox] = useState<{ x: number; y: number; side: number; w: number; h: number } | null>(null);
  // Intrinsic video dimensions, set once metadata loads. Used to size the
  // stage to the camera's actual aspect ratio so the on-screen overlay
  // coordinates map 1:1 to canvas pixel coordinates without object-fit
  // cropping (which would distort the grid into a non-square rectangle
  // when the phone delivers a portrait stream).
  const [videoDims, setVideoDims] = useState<{ w: number; h: number }>({ w: 4, h: 3 });
  // Measured stage dimensions in CSS pixels. Used to compute the actual
  // displayed (object-fit: contain) video rect, so we can position overlays
  // in absolute pixels regardless of the stage's rendered aspect ratio.
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageDims, setStageDims] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setStageDims({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Currently-selected sticker color for inline editing of the captured face.
  const [paintColor, setPaintColor] = useState<Face>('U');
  // Frozen snapshot data URL set on capture so we display the exact image
  // we sampled instead of continuing to show the live (now-blurred) feed.
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const facesRef = useRef(faces);
  facesRef.current = faces;
  const faceIdxRef = useRef(faceIdx);
  faceIdxRef.current = faceIdx;
  const justCapturedRef = useRef(false);
  justCapturedRef.current = justCaptured;

  const currentFace = KID_FACE_GUIDE_ORDER[faceIdx];
  const topNeighbor = FACE_TOP_NEIGHBOR[currentFace];

  // Number of consecutive identical aligned frames required to auto-commit.
  // The alignment gate (cube present + center aligned + ≥7/9 confident +
  // correct center color) is already strong, so a single confirmation
  // frame (≈150ms) is enough to filter out a one-off noisy reading without
  // making the user "hold" after seeing the green border.
  const STABILITY_THRESHOLD = 2;
  // Sampling cadence (ms).
  const SAMPLE_INTERVAL_MS = 150;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: 640, height: 480 },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        // Detect whether we actually got the back camera. On phones,
        // 'environment' means rear-facing (don't mirror); on desktops
        // there's usually only the user-facing webcam, in which case
        // we keep the selfie-style mirror.
        const settings = stream.getVideoTracks()[0]?.getSettings?.();
        const facing = settings && (settings as MediaTrackSettings & { facingMode?: string }).facingMode;
        setMirror(facing !== 'environment');
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          // Capture the camera's intrinsic dimensions so the stage can size
          // itself to match (and percent-based overlays line up correctly).
          if (videoRef.current.videoWidth && videoRef.current.videoHeight) {
            setVideoDims({
              w: videoRef.current.videoWidth,
              h: videoRef.current.videoHeight,
            });
          }
          setReady(true);
        }
      } catch (e) {
        setError((e as Error).message || 'Camera unavailable');
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function commitFace(sample: FrameSample) {
    const expected = KID_FACE_GUIDE_ORDER[faceIdxRef.current];
    // Verify the center matches: if not, reject and let the user reposition.
    if (sample.cells[4] !== expected) {
      const NAMES: Record<Face, string> = {
        U: 'White', D: 'Yellow', F: 'Green', B: 'Blue', L: 'Orange', R: 'Red',
      };
      setAlignmentMsg(
        `That looks like the ${NAMES[sample.cells[4]]} face — show the ${NAMES[expected]} face.`
      );
      setStability(0);
      lastFrameRef.current = null;
      return;
    }
    setLastDetected(sample.cells);
    setSnapshot(sample.snapshotDataUrl);
    setCapturedBBox({
      x: sample.bbox.x, y: sample.bbox.y, side: sample.bbox.side,
      w: videoRef.current?.videoWidth || 640,
      h: videoRef.current?.videoHeight || 480,
    });
    let next = facesRef.current;
    for (let i = 0; i < 9; i++) {
      next = setSticker(next, expected, i, sample.cells[i]);
    }
    onChange(next);
    setJustCaptured(true);
    setAlignmentMsg(null);
    setAligned(false);
    setStability(0);
    lastFrameRef.current = null;
    // Do NOT auto-advance — the user clicks Next manually so they can
    // confirm the captured colors look right before moving on.
  }

  function manualCapture() {
    if (!videoRef.current) return;
    commitFace(sampleFace(videoRef.current));
  }

  // Continuous sampling loop for auto-capture + live preview.
  const lastFrameRef = useRef<Face[] | null>(null);
  useEffect(() => {
    if (!ready) return;
    let stopped = false;
    const id = window.setInterval(() => {
      if (stopped) return;
      const video = videoRef.current;
      if (!video || video.readyState < 2) return;
      // Pause sampling while the captured ✓ confirmation is shown so the
      // user has time to look at it before any further state changes.
      if (justCapturedRef.current) return;
      const sample = sampleFace(video);

      if (!autoCapture) return;
      const expected = KID_FACE_GUIDE_ORDER[faceIdxRef.current];

      // ---- Alignment gate ---------------------------------------------------
      // Auto-capture only when we've locked onto a real cube and the colors
      // read confidently. Detection replaces the old "line up with the box"
      // requirement — the kid just needs the cube somewhere in frame.
      if (!sample.cubePresent) {
        setAlignmentMsg('Show your cube to the camera.');
        setAligned(false);
        lastFrameRef.current = null;
        setStability(0);
        return;
      }
      if (!sample.allConfident) {
        setAlignmentMsg('Hold the cube steady — colors are unclear.');
        setAligned(false);
        lastFrameRef.current = null;
        setStability(0);
        return;
      }
      if (sample.centerFace !== expected) {
        setAlignmentMsg(null);
        setAligned(false);
        lastFrameRef.current = null;
        setStability(0);
        return;
      }
      setAlignmentMsg(null);
      setAligned(true);
      // ---- End alignment gate ----------------------------------------------

      const prev = lastFrameRef.current;
      const same = prev && prev.every((c, i) => c === sample.cells[i]);
      lastFrameRef.current = sample.cells;
      if (same) {
        setStability((s) => {
          const next = s + 1;
          if (next >= STABILITY_THRESHOLD) {
            commitFace(sample);
            return 0;
          }
          return next;
        });
      } else {
        setStability(1);
      }
    }, SAMPLE_INTERVAL_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, [ready, autoCapture]);

  function nextFace() {
    setLastDetected(null);
    setStability(0);
    setJustCaptured(false);
    setAlignmentMsg(null);
    setAligned(false);
    setSnapshot(null);
    setCapturedBBox(null);
    lastFrameRef.current = null;
    setFaceIdx((i) => Math.min(KID_FACE_GUIDE_ORDER.length - 1, i + 1));
  }
  function prevFace() {
    setLastDetected(null);
    setStability(0);
    setJustCaptured(false);
    setAlignmentMsg(null);
    setAligned(false);
    setSnapshot(null);
    setCapturedBBox(null);
    lastFrameRef.current = null;
    setFaceIdx((i) => Math.max(0, i - 1));
  }
  function retake() {
    setLastDetected(null);
    setStability(0);
    setJustCaptured(false);
    setAlignmentMsg(null);
    setAligned(false);
    setSnapshot(null);
    setCapturedBBox(null);
    lastFrameRef.current = null;
  }

  const isLast = faceIdx === KID_FACE_GUIDE_ORDER.length - 1;

  return (
    <div className="camera-scanner">
      <div className="camera-scanner__header">
        <h2>📷 Scan your cube</h2>
        <button type="button" className="ghost" onClick={onClose}>✖ Close</button>
      </div>

      {error && (
        <div className="camera-scanner__error">
          Camera error: {error}<br />
          You can still paint the cube manually.
        </div>
      )}

      <div className="camera-scanner__prompt-row">
        <IsoCubeIcon front={currentFace} top={topNeighbor} size={80} />
        <div className="camera-scanner__prompt">
          Hold the cube like this picture:
          {autoCapture && ready && !justCaptured && (
            <div className={'camera-scanner__status' + (aligned ? ' camera-scanner__status--ok' : '')}>
              {alignmentMsg
                ? alignmentMsg
                : aligned
                  ? `✓ Got it — capturing…`
                  : 'Show your cube to the camera.'}
            </div>
          )}
          {justCaptured && (
            <div className="camera-scanner__status camera-scanner__status--ok">
              ✓ Captured! Tap any sticker below to fix it, then Next.
            </div>
          )}
        </div>
      </div>

      <div
        ref={stageRef}
        className="camera-scanner__stage"
        style={{ aspectRatio: `${videoDims.w} / ${videoDims.h}` }}
      >
        <video
          ref={videoRef}
          playsInline
          muted
          className="camera-scanner__video"
          style={{ visibility: snapshot ? 'hidden' : 'visible', transform: mirror ? 'scaleX(-1)' : 'none' }}
        />
        {capturedBBox && (() => {
          // Compute the actual displayed video rect inside the stage given
          // object-fit: contain. This is robust against any mismatch between
          // the stage's CSS aspect-ratio and the video's intrinsic aspect.
          const sw = stageDims.w;
          const sh = stageDims.h;
          if (!sw || !sh) return null;
          const cw = capturedBBox.w;
          const ch = capturedBBox.h;
          const stageAR = sw / sh;
          const vidAR = cw / ch;
          let dispW: number, dispH: number, ox: number, oy: number;
          if (vidAR > stageAR) {
            // Video is wider than stage → letterbox top/bottom.
            dispW = sw;
            dispH = sw / vidAR;
            ox = 0;
            oy = (sh - dispH) / 2;
          } else {
            // Video is taller → letterbox left/right.
            dispH = sh;
            dispW = sh * vidAR;
            ox = (sw - dispW) / 2;
            oy = 0;
          }
          const sidePx = (capturedBBox.side / cw) * dispW; // square in display px
          const leftPx = ox + (capturedBBox.x / cw) * dispW;
          const topPx = oy + (capturedBBox.y / ch) * dispH;
          const styleBase = {
            left: leftPx + 'px',
            top: topPx + 'px',
            width: sidePx + 'px',
            height: sidePx + 'px',
          };
          return (
            <>
              {snapshot && (
                <img
                  src={snapshot}
                  alt="Captured face snapshot"
                  className="camera-scanner__snapshot"
                  style={{ ...styleBase, transform: 'none' }}
                />
              )}
              <div
                className={
                  'camera-scanner__grid' +
                  (lastDetected ? ' camera-scanner__grid--editable' : '')
                }
                style={{ ...styleBase, transform: 'none' }}
              >
                {Array.from({ length: 9 }).map((_, i) => {
            const captured = lastDetected?.[i];
            const isCenter = i === 4;
            const editable = !!captured && !isCenter;
            const bg = captured ? FACE_COLORS[captured] : 'transparent';
            const op = captured ? 0.75 : 1;
            const className =
              'camera-scanner__cell' +
              (captured ? ' camera-scanner__cell--captured' : '') +
              (editable ? ' camera-scanner__cell--editable' : '');
            if (editable) {
              return (
                <button
                  key={i}
                  type="button"
                  className={className}
                  style={{ backgroundColor: bg, opacity: op }}
                  aria-label={`Sticker ${i + 1} (${COLOR_NAMES[captured!]}) — tap to set to ${COLOR_NAMES[paintColor]}`}
                  onClick={() => {
                    onChange(setSticker(facesRef.current, currentFace, i, paintColor));
                    const next = lastDetected!.slice();
                    next[i] = paintColor;
                    setLastDetected(next);
                  }}
                />
              );
            }
            return (
              <div
                key={i}
                className={className}
                style={{ backgroundColor: bg, opacity: op }}
                aria-hidden
              />
            );
          })}
              </div>
            </>
          );
        })()}
      </div>

      <div className="camera-scanner__controls">
        <button type="button" onClick={prevFace} disabled={faceIdx === 0}>
          ⬅ Previous face
        </button>
        <label className="camera-scanner__auto-toggle">
          <input
            type="checkbox"
            checked={autoCapture}
            onChange={(e) => setAutoCapture(e.target.checked)}
          />
          {' '}Auto-capture
        </label>
        {justCaptured ? (
          <button type="button" onClick={retake}>
            🔄 Retake
          </button>
        ) : (
          <button
            type="button"
            className="primary"
            onClick={manualCapture}
            disabled={!ready}
          >📸 Capture {COLOR_NAMES[currentFace]} face</button>
        )}
        {isLast ? (() => {
          const v = validate(facesRef.current);
          const canDone = (justCaptured || lastDetected) && v.valid;
          return (
            <button
              type="button"
              className="primary"
              onClick={onClose}
              disabled={!canDone}
              title={v.valid ? 'Solve the cube' : v.error}
            >
              ✅ Done — Solve it!
            </button>
          );
        })() : (
          <button
            type="button"
            className={justCaptured ? 'primary' : ''}
            onClick={nextFace}
            disabled={!justCaptured && !lastDetected}
          >
            Next face ➡
          </button>
        )}
      </div>

      {/* On the last face, show inline validation so the user can fix any
          miscounts (tap a sticker → repaint with the palette) BEFORE Done. */}
      {isLast && (justCaptured || lastDetected) && (() => {
        const v = validate(facesRef.current);
        if (v.valid) {
          return (
            <div className="camera-scanner__status camera-scanner__status--ok">
              ✓ All 54 stickers look good! Tap <b>Done</b> to solve.
            </div>
          );
        }
        return (
          <div className="camera-scanner__mismatch">
            ⚠ {v.error}. Tap any wrong sticker on the preview to fix it.
          </div>
        );
      })()}

      {/* When a face has been captured, show a small palette so the user
          can tap any sticker on the preview above to recolor it. The center
          sticker is locked to the face color. */}
      {lastDetected && (
        <div className="camera-scanner__editor-palette">
          <small>Tap a sticker on the preview to fix it. Paint color:</small>
          <ColorPalette selected={paintColor} onSelect={setPaintColor} />
        </div>
      )}

      <div className="camera-scanner__progress">
        {KID_FACE_GUIDE_ORDER.map((f, i) => (
          <span
            key={f}
            className={'dot' + (i === faceIdx ? ' dot--current' : '')}
            style={{ backgroundColor: FACE_COLORS[f] }}
            title={COLOR_NAMES[f]}
          />
        ))}
      </div>

      <p className="camera-scanner__hint">
        Tip: hold the cube under good light, fill the square frame, and keep it
        still — auto-capture will snap when the cube is detected and stable.
      </p>
    </div>
  );
}
