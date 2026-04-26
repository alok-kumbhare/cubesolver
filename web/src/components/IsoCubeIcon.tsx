import type { Face } from '../cube/model';
import { FACE_COLORS } from '../cube/theme';

interface Props {
  // Color of the face the user is showing to the camera (front of the icon).
  front: Face;
  // Color of the face that should be at the top of the camera frame.
  top: Face;
  // Side face — usually neutral so the eye focuses on top + front.
  side?: Face | null;
  size?: number;
}

// CSS-only isometric mini Rubik's cube. Each visible face draws a 3×3
// grid of stickers in the same colour so it visually reads as a real
// cube to a kid. The front and top faces are coloured to indicate
// orientation; the side face stays grey to keep focus on the two that
// matter.
export function IsoCubeIcon({ front, top, side = null, size = 64 }: Props) {
  const half = size / 2;
  return (
    <div
      className="iso-cube"
      style={{ width: size, height: size }}
      aria-hidden
    >
      <div
        className="iso-cube__scene"
        style={{ width: size, height: size }}
      >
        <StickerFace
          className="iso-cube__face iso-cube__face--front"
          size={size}
          color={FACE_COLORS[front]}
          transform={`translateZ(${half}px)`}
        />
        <StickerFace
          className="iso-cube__face iso-cube__face--top"
          size={size}
          color={FACE_COLORS[top]}
          transform={`rotateX(90deg) translateZ(${half}px)`}
        />
        <StickerFace
          className="iso-cube__face iso-cube__face--right"
          size={size}
          color={side ? FACE_COLORS[side] : '#45475a'}
          transform={`rotateY(90deg) translateZ(${half}px)`}
          dim={!side}
          allGrey={!side}
        />
      </div>
    </div>
  );
}

function StickerFace({
  className, size, color, transform, dim = false, allGrey = false,
}: {
  className: string;
  size: number;
  color: string;
  transform: string;
  dim?: boolean;
  allGrey?: boolean;
}) {
  const pad = Math.max(2, Math.round(size * 0.06));
  const gap = Math.max(1, Math.round(size * 0.025));
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        transform,
        background: '#11111b',
        padding: pad,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gridTemplateRows: 'repeat(3, 1fr)',
        gap,
        opacity: dim ? 0.55 : 1,
      }}
    >
      {Array.from({ length: 9 }).map((_, i) => (
        <div
          key={i}
          style={{
            background: allGrey ? '#45475a' : (i === 4 ? color : '#45475a'),
            borderRadius: Math.max(1, Math.round(size * 0.04)),
          }}
        />
      ))}
    </div>
  );
}
