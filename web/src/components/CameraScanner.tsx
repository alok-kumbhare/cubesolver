import { useEffect, useRef, useState } from 'react';
import type { Faces, Face } from '../cube/model';
import { setSticker } from '../cube/model';
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
  // Whites: low saturation, decent brightness. Looser for indoor lighting.
  if (s < 0.32 && v > 0.45) return { face: 'U', confident: true };
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
  let R = 0, G = 0, B = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    R += data[i]; G += data[i + 1]; B += data[i + 2]; n++;
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

interface FrameSample {
  cells: Face[];               // 9 classified colors, row-major
  allConfident: boolean;       // every cell hit the HSV thresholds (no nearest-RGB fallback)
  centerAligned: boolean;      // 5 sub-points within the center cell agree → cube center is on a sticker, not on a gap
  centerFace: Face;            // detected center color (independent of expected)
  cubePresent: boolean;        // dark sticker gaps detected → not pointed at a flat wall
  snapshotDataUrl: string;     // PNG data URL of the cropped ROI for "freeze the frame" UX
}

function sampleFace(video: HTMLVideoElement): FrameSample {
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d')!;
  // Sample from the un-mirrored camera frame. The canonical face layout
  // (Kociemba's "looking at the face from outside") matches the camera's
  // native point of view, so data[0] is the real top-left sticker. The
  // displayed <video> is CSS-mirrored for selfie-style alignment, and the
  // grid overlay is mirrored along with it, so the on-screen feedback
  // still lines up with what the user sees.
  ctx.drawImage(video, 0, 0);

  // Centered square ROI matching the on-screen grid. Smaller ROI = the cube
  // can be further from the camera and still fit.
  const side = Math.min(canvas.width, canvas.height) * 0.5;
  const ox = (canvas.width - side) / 2;
  const oy = (canvas.height - side) / 2;
  const cell = side / 3;
  const sampleHalf = 6; // 12x12 sample, well inside any sticker

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
  // shouldn't block the whole capture). Center-alignment check below is
  // strict enough to keep us honest.
  const allConfident = confidentCount >= 7;

  // Center-alignment check: take 5 sub-samples within the center cell. The
  // center sub-sample MUST be confident; among the 4 neighbors at ~25% cell
  // offset, at least 3 of 4 must agree with it. This tolerates one neighbor
  // landing near a sticker gap or shadow.
  const ccx = ox + cell * 1.5;
  const ccy = oy + cell * 1.5;
  const off = cell * 0.25;
  const center = sampleAt(ctx, ccx, ccy, sampleHalf);
  const neighbors = [
    sampleAt(ctx, ccx + off, ccy, sampleHalf),
    sampleAt(ctx, ccx - off, ccy, sampleHalf),
    sampleAt(ctx, ccx, ccy + off, sampleHalf),
    sampleAt(ctx, ccx, ccy - off, sampleHalf),
  ];
  const centerFace = center.face;
  const agree = neighbors.filter((n) => n.face === centerFace).length;
  const centerAligned = center.confident && agree >= 3;

  // ---- Cube-presence check ---------------------------------------------
  // A real Rubik's cube has dark plastic gaps between stickers. Sample the
  // 12 gap midpoints between adjacent cells (3 rows × 2 horiz + 3 cols × 2
  // vert) and compare each gap's brightness to the average brightness of
  // its two flanking sticker centers. If the gap is meaningfully darker,
  // it's a real sticker boundary; if not, we're probably looking at a
  // uniform surface (wall, table, etc.).
  const cellValues: number[][] = [];
  for (let r = 0; r < 3; r++) {
    cellValues[r] = [];
    for (let c = 0; c < 3; c++) {
      cellValues[r][c] = sampleValue(ctx, ox + cell * (c + 0.5), oy + cell * (r + 0.5), sampleHalf);
    }
  }
  const GAP_DARKNESS_MIN = 0.12;     // gap must be at least 12% darker
  const GAP_HALF = 3;                // 6x6 sample at each gap
  let darkGaps = 0;
  // horizontal gaps (between cells in same row)
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 2; c++) {
      const gx = ox + cell * (c + 1);
      const gy = oy + cell * (r + 0.5);
      const gV = sampleValue(ctx, gx, gy, GAP_HALF);
      const flank = (cellValues[r][c] + cellValues[r][c + 1]) / 2;
      if (flank - gV >= GAP_DARKNESS_MIN) darkGaps++;
    }
  }
  // vertical gaps
  for (let c = 0; c < 3; c++) {
    for (let r = 0; r < 2; r++) {
      const gx = ox + cell * (c + 0.5);
      const gy = oy + cell * (r + 1);
      const gV = sampleValue(ctx, gx, gy, GAP_HALF);
      const flank = (cellValues[r][c] + cellValues[r + 1][c]) / 2;
      if (flank - gV >= GAP_DARKNESS_MIN) darkGaps++;
    }
  }
  // 12 gaps total; require at least 7 to look like real sticker boundaries.
  const cubePresent = darkGaps >= 7;

  // Snapshot the ROI so we can freeze-frame on capture.
  const snapCanvas = document.createElement('canvas');
  snapCanvas.width = side;
  snapCanvas.height = side;
  snapCanvas.getContext('2d')!.drawImage(canvas, ox, oy, side, side, 0, 0, side, side);
  const snapshotDataUrl = snapCanvas.toDataURL('image/png');

  return { cells, allConfident, centerAligned, centerFace, cubePresent, snapshotDataUrl };
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
  const [livePreview, setLivePreview] = useState<Face[] | null>(null);
  const [autoCapture, setAutoCapture] = useState(true);
  const [, setStability] = useState(0);
  const [justCaptured, setJustCaptured] = useState(false);
  const [centerMismatch, setCenterMismatch] = useState<Face | null>(null);
  const [alignmentMsg, setAlignmentMsg] = useState<string | null>(null);
  const [aligned, setAligned] = useState(false);
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
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
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
      setCenterMismatch(sample.cells[4]);
      setStability(0);
      lastFrameRef.current = null;
      return;
    }
    setCenterMismatch(null);
    setLastDetected(sample.cells);
    setSnapshot(sample.snapshotDataUrl);
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
      // Always show live preview.
      setLivePreview(sample.cells.slice() as Face[]);

      if (!autoCapture) return;
      const expected = KID_FACE_GUIDE_ORDER[faceIdxRef.current];

      // ---- Alignment gate ---------------------------------------------------
      // Auto-capture only when the WHOLE cube fits the frame and the center
      // sticker is properly aligned with the grid center. Each gate explains
      // *why* it failed so the prompt can guide the user.
      if (!sample.cubePresent) {
        setAlignmentMsg('Show your cube to the camera (no cube detected).');
        setAligned(false);
        lastFrameRef.current = null;
        setStability(0);
        return;
      }
      if (!sample.allConfident) {
        setAlignmentMsg('Show all 9 stickers inside the square.');
        setAligned(false);
        lastFrameRef.current = null;
        setStability(0);
        return;
      }
      if (!sample.centerAligned) {
        setAlignmentMsg('Line up the middle sticker with the center square.');
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
    setLivePreview(null);
    setStability(0);
    setJustCaptured(false);
    setCenterMismatch(null);
    setAlignmentMsg(null);
    setAligned(false);
    setSnapshot(null);
    lastFrameRef.current = null;
    setFaceIdx((i) => Math.min(KID_FACE_GUIDE_ORDER.length - 1, i + 1));
  }
  function prevFace() {
    setLastDetected(null);
    setLivePreview(null);
    setStability(0);
    setJustCaptured(false);
    setCenterMismatch(null);
    setAlignmentMsg(null);
    setAligned(false);
    setSnapshot(null);
    lastFrameRef.current = null;
    setFaceIdx((i) => Math.max(0, i - 1));
  }
  function retake() {
    setLastDetected(null);
    setStability(0);
    setJustCaptured(false);
    setCenterMismatch(null);
    setAlignmentMsg(null);
    setAligned(false);
    setSnapshot(null);
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
          {autoCapture && ready && !justCaptured && !centerMismatch && (
            <div className={'camera-scanner__status' + (aligned ? ' camera-scanner__status--ok' : '')}>
              {alignmentMsg
                ? alignmentMsg
                : aligned
                  ? `✓ Lined up — capturing…`
                  : 'Aim the cube at the green square.'}
            </div>
          )}
          {justCaptured && (
            <div className="camera-scanner__status camera-scanner__status--ok">
              ✓ Captured! Tap any sticker below to fix it, then Next.
            </div>
          )}
        </div>
      </div>

      {centerMismatch && (
        <div className="camera-scanner__mismatch">
          That looked like the{' '}
          <b style={{ color: FACE_COLORS[centerMismatch] }}>
            {COLOR_NAMES[centerMismatch]}
          </b>{' '}
          face, not{' '}
          <b style={{ color: FACE_COLORS[currentFace] }}>
            {COLOR_NAMES[currentFace]}
          </b>
          . Show the {COLOR_NAMES[currentFace]} side and try again.
        </div>
      )}

      <div className="camera-scanner__stage">
        <video
          ref={videoRef}
          playsInline
          muted
          className="camera-scanner__video"
          style={{ visibility: snapshot ? 'hidden' : 'visible', transform: 'scaleX(-1)' }}
        />
        {snapshot && (
          <img
            src={snapshot}
            alt="Captured face snapshot"
            className="camera-scanner__snapshot"
          />
        )}
        <div
          className={
            'camera-scanner__grid' +
            (aligned ? ' camera-scanner__grid--aligned' : '') +
            (lastDetected ? ' camera-scanner__grid--editable' : '')
          }
          // Match the visual orientation of the media behind the grid: the
          // live <video> is CSS-mirrored (selfie), so the grid mirrors with
          // it; the snapshot is un-mirrored (real view), so the grid is
          // un-mirrored too. Cell DOM order stays the same, so data[0] is
          // always the canonical top-left sticker.
          style={{
            // Preserve the CSS centering transform and only flip horizontally
            // when the live video is shown (selfie view). When the snapshot
            // is up, drop the flip so the grid matches the un-mirrored
            // captured image.
            transform: snapshot
              ? 'translate(-50%, -50%)'
              : 'translate(-50%, -50%) scaleX(-1)',
          }}
        >
          {Array.from({ length: 9 }).map((_, i) => {
            const captured = lastDetected?.[i];
            const live = livePreview?.[i];
            const shown = captured ?? live;
            const isCenter = i === 4;
            const centerHint = isCenter && !captured;
            const editable = !!captured && !isCenter;
            const bg = captured
              ? FACE_COLORS[captured]
              : centerHint
                ? FACE_COLORS[currentFace]
                : shown
                  ? FACE_COLORS[shown]
                  : 'transparent';
            const op = captured ? 0.7 : centerHint ? 0.45 : live ? 0.3 : 1;
            const className =
              'camera-scanner__cell' +
              (captured ? ' camera-scanner__cell--captured' : '') +
              (centerHint ? ' camera-scanner__cell--center-hint' : '') +
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
        {isLast ? (
          <button
            type="button"
            className="primary"
            onClick={onClose}
            disabled={!justCaptured && !lastDetected}
          >
            ✅ Done
          </button>
        ) : (
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
