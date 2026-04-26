declare module 'cubejs' {
  export default class Cube {
    constructor(state?: Cube);
    static fromString(facelets: string): Cube;
    static random(): Cube;
    static inverse(alg: string): string;
    static initSolver(): void;
    static scramble(): string;
    init(state: Cube): void;
    identity(): void;
    asString(): string;
    clone(): Cube;
    randomize(): void;
    isSolved(): boolean;
    move(alg: string): Cube;
    solve(maxDepth?: number): string;
  }
}
