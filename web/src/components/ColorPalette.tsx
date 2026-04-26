import type { Face } from '../cube/model';
import { FACE_COLORS, COLOR_NAMES, PALETTE_ORDER } from '../cube/theme';

interface Props {
  selected: Face;
  onSelect: (face: Face) => void;
  big?: boolean;
}

export function ColorPalette({ selected, onSelect, big = false }: Props) {
  const size = big ? 64 : 44;
  return (
    <div className="palette" role="radiogroup" aria-label="Sticker color">
      {PALETTE_ORDER.map((face) => (
        <button
          key={face}
          type="button"
          role="radio"
          aria-checked={selected === face}
          aria-label={COLOR_NAMES[face]}
          title={COLOR_NAMES[face]}
          onClick={() => onSelect(face)}
          className={
            'swatch' + (selected === face ? ' swatch--selected' : '') +
            (big ? ' swatch--big' : '')
          }
          style={{
            backgroundColor: FACE_COLORS[face],
            width: size,
            height: size,
          }}
        />
      ))}
    </div>
  );
}
