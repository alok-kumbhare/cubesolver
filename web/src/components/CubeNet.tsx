import { type Faces, type Face, setSticker } from '../cube/model';
import { FACE_COLORS } from '../cube/theme';

interface Props {
  faces: Faces;
  // When omitted, the net is render-only (no painting allowed).
  onChange?: (next: Faces) => void;
  selectedColor?: Face;
  cellSize?: number;
}

const FACE_LAYOUT: Array<{ face: Face; col: number; row: number }> = [
  { face: 'U', col: 1, row: 0 },
  { face: 'L', col: 0, row: 1 },
  { face: 'F', col: 1, row: 1 },
  { face: 'R', col: 2, row: 1 },
  { face: 'B', col: 3, row: 1 },
  { face: 'D', col: 1, row: 2 },
];

export function CubeNet({ faces, onChange, selectedColor, cellSize = 36 }: Props) {
  const gap = 4;
  const faceSize = cellSize * 3 + gap * 2;
  const faceGap = 8;
  const totalW = faceSize * 4 + faceGap * 3;
  const totalH = faceSize * 3 + faceGap * 2;
  const editable = !!onChange && !!selectedColor;

  function paint(face: Face, idx: number) {
    if (idx === 4 || !editable) return;
    onChange!(setSticker(faces, face, idx, selectedColor!));
  }

  return (
    <div
      className="cube-net"
      style={{ width: totalW, height: totalH, position: 'relative' }}
    >
      {FACE_LAYOUT.map(({ face, col, row }) => {
        const x = col * (faceSize + faceGap);
        const y = row * (faceSize + faceGap);
        return (
          <div
            key={face}
            className="cube-net__face"
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: faceSize,
              height: faceSize,
              display: 'grid',
              gridTemplateColumns: `repeat(3, ${cellSize}px)`,
              gridTemplateRows: `repeat(3, ${cellSize}px)`,
              gap,
            }}
            aria-label={`${face} face`}
          >
            {faces[face].map((color, i) => {
              const isCenter = i === 4;
              return (
                <button
                  key={i}
                  type="button"
                  className={'sticker' + (isCenter ? ' sticker--center' : '')}
                  onClick={() => paint(face, i)}
                  disabled={isCenter || !editable}
                  aria-label={`${face}${i} ${color}`}
                  style={{
                    backgroundColor: FACE_COLORS[color],
                    width: cellSize,
                    height: cellSize,
                    cursor: editable && !isCenter ? 'pointer' : 'default',
                  }}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
