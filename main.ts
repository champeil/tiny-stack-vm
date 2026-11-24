// tiny-stack-vm-01 entry: an interpreter of make.fun's tiny stack ISA v1 (ISA.md). For every /input/<id>/ it runs
// program.bin on input.bin and writes /output/<id>/stdout.bin and /output/<id>/exit.txt.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const IN = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUT = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// META[op] = (immediate bytes << 4 | pops << 2 | pushes) + 1; 0 means "not an opcode".
const META = new Uint8Array(256);
for (const o of [0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x18, 0x19, 0x1a, 0x1c, 0x1d, 0x1e, 0x20, 0x21, 0x22]) META[o] = 0x0a;
for (const [o, m] of [[0x00, 0x01], [0x01, 0x12], [0x02, 0x42], [0x03, 0x05], [0x04, 0x07], [0x05, 0x0b], [0x06, 0x0c], [0x07, 0x10], [0x17, 0x06], [0x1b, 0x06], [0x30, 0x21], [0x31, 0x25], [0x32, 0x25], [0x33, 0x21], [0x34, 0x01], [0x40, 0x06], [0x41, 0x09], [0x50, 0x05], [0x51, 0x05], [0x52, 0x02], [0x53, 0x05]]) META[o] = m;

function run(p: Uint8Array, inp: Uint8Array): [Uint8Array, number] {
  const n = p.length;
  const D = new Int32Array(256); // data stack
  const C = new Int32Array(64); // call stack
  const M = new Int32Array(256); // memory
  const out = new Uint8Array(65536);
  let sp = 0, cp = 0, olen = 0, ip = 0, pc = 0, steps = 0, code = 0;
  loop: for (;;) {
    if (steps === 1000000) { code = 10; break; }
    if (pc < 0 || pc >= n) { code = 9; break; }
    const op = p[pc], m = META[op];
    if (m === 0) { code = 5; break; }
    const imm = (m - 1) >> 4, pops = ((m - 1) >> 2) & 3, pushes = (m - 1) & 3;
    if (pc + imm >= n) { code = 9; break; }
    steps++;
    const nx = pc + 1 + imm;
    if (sp < pops) { code = 2; break; }
    if (sp - pops + pushes > 256) { code = 3; break; }
    pc = nx;
    switch (op) {
      case 0x00: break loop; // HALT
      case 0x01: D[sp++] = (p[nx - 1] << 24) >> 24; break;
      case 0x02: D[sp++] = p[nx - 4] | p[nx - 3] << 8 | p[nx - 2] << 16 | p[nx - 1] << 24; break;
      case 0x03: sp--; break;
      case 0x04: D[sp] = D[sp - 1]; sp++; break;
      case 0x05: { const t = D[sp - 1]; D[sp - 1] = D[sp - 2]; D[sp - 2] = t; break; }
      case 0x06: D[sp] = D[sp - 2]; sp++; break;
      case 0x07: { const t = D[sp - 3]; D[sp - 3] = D[sp - 2]; D[sp - 2] = D[sp - 1]; D[sp - 1] = t; break; }
      case 0x17: D[sp - 1] = -D[sp - 1] | 0; break;
      case 0x1b: D[sp - 1] = ~D[sp - 1]; break;
      case 0x30: case 0x31: case 0x32: {
        const rel = (p[nx - 2] | p[nx - 1] << 8) << 16 >> 16;
        let take = true;
        if (op !== 0x30) { const v = D[--sp]; take = op === 0x31 ? v === 0 : v !== 0; }
        if (take) pc = nx + rel;
        break;
      }
      case 0x33: // CALL
        if (cp === 64) { code = 7; break loop; }
        C[cp++] = nx;
        pc = p[nx - 2] | p[nx - 1] << 8;
        break;
      case 0x34: // RET
        if (cp === 0) { code = 8; break loop; }
        pc = C[--cp];
        break;
      case 0x40: { const a = D[sp - 1]; if (a < 0 || a > 255) { code = 6; break loop; } D[sp - 1] = M[a]; break; }
      case 0x41: { const a = D[sp - 1]; if (a < 0 || a > 255) { code = 6; break loop; } M[a] = D[sp - 2]; sp -= 2; break; }
      case 0x50: { // PRINT
        const s = String(D[sp - 1]);
        if (olen + s.length > 65536) { code = 11; break loop; }
        sp--;
        for (let i = 0; i < s.length; i++) out[olen++] = s.charCodeAt(i);
        break;
      }
      case 0x51: // PUTC
        if (olen === 65536) { code = 11; break loop; }
        out[olen++] = D[--sp] & 255;
        break;
      case 0x52: D[sp++] = ip < inp.length ? inp[ip++] : -1; break;
      case 0x53: code = D[--sp] & 255; break loop; // EXIT
      default: { // ADD SUB MUL DIV MOD DIVU MODU AND OR XOR SHL SHR SHRU EQ LT LTU
        const b = D[sp - 1], a = D[sp - 2];
        let r: number;
        if (op === 0x10) r = a + b | 0;
        else if (op === 0x11) r = a - b | 0;
        else if (op === 0x12) r = Math.imul(a, b);
        else if (op === 0x13) { if (b === 0) { code = 4; break loop; } r = a === -2147483648 && b === -1 ? a : a / b | 0; }
        else if (op === 0x14) { if (b === 0) { code = 4; break loop; } r = b === -1 ? 0 : a % b | 0; }
        else if (op === 0x15) { if (b === 0) { code = 4; break loop; } r = Math.floor((a >>> 0) / (b >>> 0)) | 0; }
        else if (op === 0x16) { if (b === 0) { code = 4; break loop; } r = (a >>> 0) % (b >>> 0) | 0; }
        else if (op === 0x18) r = a & b;
        else if (op === 0x19) r = a | b;
        else if (op === 0x1a) r = a ^ b;
        else if (op === 0x1c) r = a << (b & 31);
        else if (op === 0x1d) r = a >> (b & 31);
        else if (op === 0x1e) r = (a >>> (b & 31)) | 0;
        else if (op === 0x20) r = a === b ? 1 : 0;
        else if (op === 0x21) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        sp -= 2;
        D[sp++] = r;
      }
    }
  }
  return [out.slice(0, olen), code];
}

for (const id of readdirSync(IN).sort()) {
  let prog: Uint8Array, inp: Uint8Array;
  try {
    prog = new Uint8Array(readFileSync(join(IN, id, 'program.bin')));
    inp = new Uint8Array(readFileSync(join(IN, id, 'input.bin')));
  } catch {
    continue; // not an instance directory: one bad entry must not cost the other 39
  }
  const [bytes, code] = run(prog, inp);
  mkdirSync(join(OUT, id), { recursive: true });
  writeFileSync(join(OUT, id, 'stdout.bin'), bytes);
  writeFileSync(join(OUT, id, 'exit.txt'), code + '\n');
}
