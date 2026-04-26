import { useEffect, useState } from 'react';
import { type Faces, createSolved } from './cube/model';
import type { SolveStep } from './cube/moves';
import { solve, SolverError, initSolver, isSolverReady } from './cube/solver';
import { CubeNet } from './components/CubeNet';
import { StepViewer } from './components/StepViewer';
import { Cube3D } from './components/Cube3D';
import { CameraScanner } from './components/CameraScanner';
import { useTTS } from './hooks/useTTS';
import './styles/theme.css';

const MOVE_DURATION_MS = 650;

export default function App() {
  const [faces, setFaces] = useState<Faces>(createSolved);
  const [steps, setSteps] = useState<SolveStep[]>([]);
  const [states, setStates] = useState<Faces[]>([]);
  const [stepIdx, setStepIdx] = useState(0);
  const [status, setStatus] = useState<string>('');
  const [statusKind, setStatusKind] = useState<'info' | 'ok' | 'err'>('info');
  const [solving, setSolving] = useState(false);
  const [ttsEnabled, setTTSEnabled] = useState(true);
  // Camera is the only way to enter the cube — open it by default and
  // re-open on Reset / Scan again.
  const [scanning, setScanning] = useState(true);
  const [solverReadyTick, setSolverReadyTick] = useState(0);
  const [replayTick, setReplayTick] = useState(0);

  const tts = useTTS(ttsEnabled);

  useEffect(() => {
    initSolver().then(() => setSolverReadyTick((t) => t + 1));
  }, []);

  useEffect(() => {
    if (!ttsEnabled || steps.length === 0) return;
    if (stepIdx === 0) {
      tts.speak("Here is your cube. Press next to start.");
      return;
    }
    if (stepIdx >= steps.length) {
      tts.speak('All done! Great job!');
      return;
    }
    const s = steps[stepIdx];
    tts.speak(s.kidDescription);
  }, [stepIdx, steps, ttsEnabled]); // eslint-disable-line

  function setStatusMsg(msg: string, kind: 'info' | 'ok' | 'err' = 'info') {
    setStatus(msg);
    setStatusKind(kind);
  }

  function handleReset() {
    setFaces(createSolved());
    setSteps([]);
    setStates([]);
    setStepIdx(0);
    tts.cancel();
    setStatusMsg('', 'info');
    setScanning(true);
  }

  async function handleSolve() {
    setStatusMsg(isSolverReady() ? 'Solving…' : 'Loading solver (one-time, ~5s)…');
    setSolving(true);
    try {
      const res = await solve(faces);
      setSteps(res.steps);
      setStates(res.states);
      setStepIdx(0);
      if (res.rotated) setFaces(res.normalizedFaces);
      if (res.steps.length === 0) {
        setStatusMsg('Already solved! 🎉', 'ok');
      } else {
        const note = res.rotated ? ' (orientations auto-corrected)' : '';
        setStatusMsg(`Solved in ${res.steps.length} moves!${note}`, 'ok');
      }
    } catch (e) {
      const msg = e instanceof SolverError ? e.message : (e as Error).message;
      setStatusMsg(`❌ ${msg}`, 'err');
    } finally {
      setSolving(false);
    }
  }

  function handleStepIndex(target: number) {
    target = Math.max(0, Math.min(steps.length, target));
    if (target !== stepIdx) setReplayTick(0);
    setStepIdx(target);
  }

  function handleReplay() {
    if (stepIdx >= steps.length) return;
    setReplayTick((t) => t + 1);
  }

  const liveFaces =
    states.length > 0 ? states[Math.min(stepIdx, states.length - 1)] : faces;

  const demoStep = stepIdx < steps.length ? steps[stepIdx] : null;
  const animation = demoStep
    ? {
        preFaces: states[stepIdx],
        face: demoStep.face,
        direction: demoStep.direction,
        durationMs: MOVE_DURATION_MS,
        loop: false,
        replayKey: `${stepIdx}-${replayTick}`,
      }
    : null;

  void solverReadyTick;

  return (
    <div className="app app--kid">
      <header className="app__header">
        <h1 className="app__title">🧊 Rubik's Cube Solver</h1>
      </header>

      <main className="app__main">
        <section className="app__left">
          {scanning ? (
            <CameraScanner
              faces={faces}
              onChange={setFaces}
              onClose={() => {
                setScanning(false);
                setTimeout(() => { void handleSolve(); }, 0);
              }}
            />
          ) : (
            <>
              <div className="card card--net">
                <div className="card__title">Your cube</div>
                <div className="card__center">
                  <CubeNet faces={faces} cellSize={28} />
                </div>
              </div>
              <div className="card card--actions">
                <button
                  type="button"
                  className="btn btn--scan"
                  onClick={() => setScanning(true)}
                >📷 Scan again</button>
                <button type="button" className="btn btn--reset" onClick={handleReset}>
                  🔄 Reset
                </button>
                {!solving && steps.length === 0 && (
                  <button
                    type="button"
                    className="btn btn--solve"
                    onClick={handleSolve}
                  >
                    ✨ Solve It! ✨
                  </button>
                )}
              </div>
              {status && (
                <div className={'status status--' + statusKind}>{status}</div>
              )}
            </>
          )}
        </section>

        <section className="app__right">
          <div className="card card--3d">
            <Cube3D
              faces={liveFaces}
              animation={animation}
              size={320}
            />
            <p className="hint">Drag to rotate</p>
          </div>

          <div className="card card--steps">
            <StepViewer
              steps={steps}
              currentIndex={stepIdx}
              onIndexChange={handleStepIndex}
              onReplay={handleReplay}
              ttsEnabled={ttsEnabled}
              onToggleTTS={() => setTTSEnabled((v) => !v)}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
