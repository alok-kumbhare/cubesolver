import Cube from 'cubejs';
import {
  createSolved, fromFaceletString, toFaceletString, validate, isSolved,
} from '../src/cube/model';
import { solve } from '../src/cube/solver';

async function main() {
  console.log('Initializing Kociemba solver (4-5s)...');
  Cube.initSolver();

  // 1. Solved cube round-trips
  const solved = createSolved();
  const v = validate(solved);
  console.assert(v.valid, 'Solved cube must validate');
  console.assert(toFaceletString(solved).length === 54, '54-char string');
  console.assert(isSolved(solved), 'Solved cube isSolved');

  // 2. Apply a scramble via cubejs, paint into our model, solve, verify.
  const scrambles = [
    "R U R' U'",
    "F R U R' U' F'",
    "R U R' U R U2 R'",
    "L D2 B' R F2 U' L' B U2 F'",
    "U R U' R' U' F' U F",
    "R U2 R' U' R U' R'",
  ];

  let pass = 0, fail = 0;
  for (const scramble of scrambles) {
    const c = new Cube();
    c.move(scramble);
    const faces = fromFaceletString(c.asString());
    console.assert(validate(faces).valid, `Scramble must validate: ${scramble}`);

    const { steps, states } = await solve(faces);

    // Apply the solution to the scrambled cube via cubejs and confirm solved.
    const verify = Cube.fromString(c.asString());
    for (const s of steps) verify.move(s.notation);
    const ok = verify.isSolved();

    // Confirm the final state in our intermediate states is solved.
    const finalState = states[states.length - 1];
    const ok2 = isSolved(finalState);

    if (ok && ok2) {
      console.log(`  PASS [${steps.length} moves]: ${scramble}`);
      pass++;
    } else {
      console.error(`  FAIL: ${scramble} — ok=${ok} ok2=${ok2}`);
      fail++;
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
