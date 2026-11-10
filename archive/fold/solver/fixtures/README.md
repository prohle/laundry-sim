# Fixtures

These files come from the TreeMaker 5 C++ source, `Source/test/tmModelTester/`.
TreeMaker 5 is by Robert J. Lang and contributors, licensed GPL-2.0-or-later.

- `tmModelTester_1.tmd5` to `tmModelTester_5.tmd5`: the five example models
  shipped with TreeMaker 5, in TreeMaker's `.tmd5` text format.
- `tmModelTester.out.txt`: the output recorded by the C++ reference test
  program. It is the reference used for parity (task 1.4). The scale
  references are taken from its ALM optimizer section:
  model 1 = 0.517637, model 2 = 0.074658, model 3 = 0.056381.
  Models 4 and 5 are exercised there by the edge and strain optimisers, so
  they have no scale reference.

The parity test is `../tests/parity.rs`. Run it with
`cargo test -- --nocapture` from `solver/`.
