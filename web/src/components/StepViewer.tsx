import type { SolveStep } from '../cube/moves';
import { COLOR_EMOJI, FACE_COLORS } from '../cube/theme';

interface Props {
  steps: SolveStep[];
  currentIndex: number; // 0..N; the index we're "at" — N means solved.
  started: boolean; // false until the user presses Start
  onStart: () => void;
  onIndexChange: (i: number) => void;
  onReplay: () => void;
  ttsEnabled: boolean;
  onToggleTTS: () => void;
}

export function StepViewer({
  steps, currentIndex, started, onStart, onIndexChange, onReplay,
  ttsEnabled, onToggleTTS,
}: Props) {
  const total = steps.length;

  // We now show "the next move to make" rather than "the move just made".
  // currentIndex is the position in the solve where the user is standing,
  // and the demo loops the step at that index until they press Next.
  const currentStep =
    started && total > 0 && currentIndex < total ? steps[currentIndex] : null;

  const stars = total > 0
    ? '⭐'.repeat(currentIndex) + '☆'.repeat(total - currentIndex)
    : '';

  return (
    <div className="step-viewer step-viewer--kid">
      <div className="step-viewer__header">
        <span className="step-viewer__counter">
          {total > 0
            ? (!started
                ? `Ready! ${total} moves to solve`
                : currentIndex < total
                  ? `Move ${currentIndex + 1} of ${total}`
                  : `All ${total} moves done!`)
            : 'Press Solve!'}
        </span>
        <div className="step-viewer__toggles">
          <button
            type="button"
            onClick={onToggleTTS}
            title="Voice on/off"
            className={'icon-btn' + (ttsEnabled ? ' icon-btn--on' : '')}
          >
            {ttsEnabled ? '🔊' : '🔇'}
          </button>
        </div>
      </div>

      {currentStep ? (
        <div className="step-viewer__instruction" aria-live="polite">
          <div
            className="step-viewer__face-chip"
            style={{ backgroundColor: FACE_COLORS[currentStep.face] }}
            aria-hidden
          >
            {COLOR_EMOJI[currentStep.face]}
          </div>
          <div className="step-viewer__kid-text">
            {currentStep.kidDescription}
          </div>
        </div>
      ) : (
        <div className="step-viewer__instruction step-viewer__instruction--idle">
          {total > 0 && !started
            ? '👀 Look at your cube. Press Start when you are ready!'
            : total > 0 && currentIndex >= total
              ? '🎉 You did it! Cube solved! 🎉'
              : 'Paint your cube and press Solve! 🎨'}
        </div>
      )}

      {total > 0 && (
        <div className="step-viewer__stars">{stars}</div>
      )}

      <div className="step-viewer__nav">
        <button
          type="button"
          onClick={() => onIndexChange(0)}
          disabled={!started || currentIndex === 0 || total === 0}
        >⏮ First</button>
        <button
          type="button"
          onClick={() => onIndexChange(Math.max(0, currentIndex - 1))}
          disabled={!started || currentIndex === 0 || total === 0}
        >◀ Back</button>
        <button
          type="button"
          className="step-viewer__replay"
          onClick={onReplay}
          disabled={!started || currentIndex >= total || total === 0}
          title="Play this move again"
        >🔁 Replay</button>
        <button
          type="button"
          className="step-viewer__play"
          onClick={() => {
            if (!started) { onStart(); return; }
            onIndexChange(Math.min(total, currentIndex + 1));
          }}
          disabled={total === 0 || (started && currentIndex >= total)}
        >{!started ? 'Start ▶' : 'Next ▶'}</button>
        <button
          type="button"
          onClick={() => onIndexChange(total)}
          disabled={!started || currentIndex >= total || total === 0}
        >Last ⏭</button>
      </div>

      {total > 0 && (
        <ol className="step-viewer__list">
          {steps.map((s, i) => (
            <li
              key={i}
              className={i === currentIndex ? 'is-current' : ''}
              onClick={() => onIndexChange(i)}
            >
              <span className="step-viewer__list-num">{i + 1}.</span>
              <span className="step-viewer__list-not">{s.notation}</span>
              <span className="step-viewer__list-desc">{s.description}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
