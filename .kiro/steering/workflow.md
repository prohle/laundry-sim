# Workflow — how to spend as few credits as possible

Kiro bills every model request. A tool call is a request, and each one re-sends this file, the
tasks and the whole conversation. Measured 2026-11-08: 65 turns, 1,077 requests, 16.6 requests per
turn, 314 credits. The cost is the loop, not the thinking.

These rules are hard. They are not style preferences.

## One verification call

- Run `tools/check.sh` and nothing else to verify. It runs typecheck, Node tests, Rust tests and
  the three fixtures, and prints one line each plus a verdict. Detail goes to `tools/out/check.json`.
- Use `tools/check.sh --full` only when `solver/` changed (it adds the parity test).
- **Never** run `npx tsc`, `npm test`, `cargo test`, `node tools/pipeline.ts` or `git status`
  as separate calls. Each is a request. If a command is not in `tools/check.sh`, add it there
  once, then call the script.
- For a question about a fixture, call `@fold-fixtures/run_pipeline`. It answers in half a second
  and returns counts, not a log.

## One task per turn

- Read `tasks.md`, pick the first open task, finish it, run `tools/check.sh`, report, stop.
- Do not start the next task in the same turn. The second task re-sends everything the first one
  built, at a higher price.
- If a task needs work that is not in `tasks.md`, say so and stop. Do not invent scope.

## Read once

- Never read the same file twice in a session. Keep what you need from the first read.
- Use `grep_search` with line numbers before `read_file`; read a range, not a 700-line file.
- Completed work is in `.kiro/archive/tasks-done.md`. Do not read it unless an open task names it.
- Do not read `design.md` or `requirements.md` unless a task names a requirement number.

## Write small

- Use targeted replacements. Do not rewrite a file to change part of it.
- Do not re-print a file you just wrote. The tool result already shows it.
- Do not paste logs into the reply. Quote one line and the file path.

## Definition of done

A task is done when its checkbox is `[x]`, `tools/check.sh` passes, and the change is committed with
the task number in the message. Nothing else counts as done.

## Never retry a recorded failure

`tasks.md` has a "Do not retry" list. It is there because those attempts cost credits and failed.
Read it before proposing an experiment.
