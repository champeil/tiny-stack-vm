# tiny-stack-vm

[![tiny-stack-vm-01](https://make.fun/badge/tiny-stack-vm-01.svg)](https://make.fun/bounty/tiny-stack-vm-01?ref=6w8nnt9d)
[![rank](https://make.fun/badge/tiny-stack-vm-01/champeil/tiny-stack-vm/rank.svg)](https://make.fun/bounty/tiny-stack-vm-01?ref=6w8nnt9d)
[![reward](https://make.fun/badge/tiny-stack-vm-01/champeil/tiny-stack-vm/reward.svg)](https://make.fun/bounty/tiny-stack-vm-01?ref=6w8nnt9d)

An interpreter of make.fun's tiny stack ISA v1 in one 5.5 KB TypeScript file.

## Run it

Node 22+, standard library only:

```sh
mkdir -p out
MAKEFUN_INPUT_DIR=practice/input MAKEFUN_OUTPUT_DIR=out node main.ts
```

For each `program.bin` it runs the program on its `input.bin` and writes `stdout.bin` and `exit.txt` (`/input` and
`/output` inside the grader).

## What it gets right

A 32-bit wrapping stack machine: data stack 256, call stack 64, 256 memory words, 1,000,000 steps, 65,536 output
bytes. Immediates are bounds-checked before execution, and each of the eleven traps exits with its own code, keeping
the output written before it. The easy-to-miss rules are all handled: `MUL` is `Math.imul`; `-2147483648 / -1` stays
`-2147483648` and `x % -1` is 0; `DIVU`, `MODU` and `LTU` compare unsigned; shift counts use their low five bits;
`SHR` is arithmetic; `PUSH8` sign-extends; `EXIT` and `PUTC` keep the low byte; falling off the end traps 9; `IN` past
the end answers -1. One flat `switch` dispatch.

MIT licence; see `LICENSE`.
