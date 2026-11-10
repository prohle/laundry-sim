//! Task 1.4: parity of treemaker-core against the TreeMaker 5 C++ reference.
//!
//! Fixtures and reference values come from `fixtures/` (see its README).
//! Reference scales are the "ALM optimizer" section of `tmModelTester.out.txt`.
//! Models 4 and 5 have no scale reference (the reference exercises them with
//! the edge and strain optimisers), so no scale is asserted for them.

use std::path::PathBuf;
use treemaker_core::Tree;

const TOLERANCE: f64 = 1e-3;
const INSET_FAILURE: &str = "polygon inset distance was not found";

struct Outcome {
    name: String,
    reference: Option<f64>,
    scale: f64,
    converged: bool,
    feasible: bool,
    crease: Result<(), String>,
}

fn run(n: u32, reference: Option<f64>) -> Outcome {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("fixtures")
        .join(format!("tmModelTester_{n}.tmd5"));
    let text = std::fs::read_to_string(&path).unwrap_or_else(|e| panic!("read {path:?}: {e}"));
    let mut tree = Tree::from_tmd_str(&text).unwrap_or_else(|e| panic!("parse model {n}: {e}"));
    let report = tree
        .optimize_scale()
        .unwrap_or_else(|e| panic!("optimize_scale model {n}: {e}"));
    let crease = tree
        .build_polys_and_crease_pattern()
        .map(|_| ())
        .map_err(|e| e.to_string());
    Outcome {
        name: format!("tmModelTester_{n}"),
        reference,
        scale: report.new_scale,
        converged: report.converged,
        feasible: report.is_feasible,
        crease,
    }
}

fn all() -> Vec<Outcome> {
    vec![
        run(1, Some(0.517637)),
        run(2, Some(0.074658)),
        run(3, Some(0.056381)),
        run(4, None),
        run(5, None),
    ]
}

#[test]
fn scale_parity_and_crease_pattern_status() {
    let outcomes = all();

    println!(
        "{:<18} {:>10} {:>10} {:>10}  conv feas  crease pattern",
        "model", "measured", "reference", "diff"
    );
    for o in &outcomes {
        let (r, d) = match o.reference {
            Some(r) => (format!("{r:.6}"), format!("{:+.6}", o.scale - r)),
            None => ("none".into(), "n/a".into()),
        };
        let cp = match &o.crease {
            Ok(()) => "built".to_string(),
            Err(e) => format!("FAILED: {e}"),
        };
        println!(
            "{:<18} {:>10.6} {:>10} {:>10}  {:<4} {:<5} {}",
            o.name, o.scale, r, d, o.converged, o.feasible, cp
        );
    }

    // Collect failures so the whole table prints before the test fails.
    let mut failures: Vec<String> = Vec::new();

    for o in &outcomes {
        // Scale parity: only where the reference records a value.
        if let Some(r) = o.reference {
            if (o.scale - r).abs() > TOLERANCE {
                failures.push(format!(
                    "{}: scale {:.6} differs from reference {:.6} by {:.6} (tolerance {TOLERANCE})",
                    o.name,
                    o.scale,
                    r,
                    (o.scale - r).abs()
                ));
            }
        }
    }

    // Crease-pattern status. Model 2 is a known failure and must be reported
    // as exactly that failure, not ignored and not turned into a success.
    for o in &outcomes {
        match (o.name.as_str(), &o.crease) {
            ("tmModelTester_2", Err(e)) if e.contains(INSET_FAILURE) => {}
            ("tmModelTester_2", Err(e)) => failures.push(format!(
                "{}: crease pattern failed with an unexpected error: {e}",
                o.name
            )),
            ("tmModelTester_2", Ok(())) => failures.push(format!(
                "{}: expected the known failure '{INSET_FAILURE}', but a crease pattern was built; \
                 update the expectation and the spec",
                o.name
            )),
            (_, Err(e)) => failures.push(format!("{}: crease pattern failed: {e}", o.name)),
            (_, Ok(())) => {}
        }
    }

    assert!(failures.is_empty(), "parity failures:\n{}", failures.join("\n"));
}
