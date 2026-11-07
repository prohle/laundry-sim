//! Fold solver driver (task 1.9).
//!
//! Reads a Fold tree as JSON on stdin, writes it as TreeMaker text, parses it
//! with treemaker-core, optimises the scale, builds the crease pattern, and
//! prints a JSON report on stdout.

use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, VecDeque};
use std::io::Read;
use treemaker_core::Tree;

#[derive(Debug, Deserialize)]
pub struct TreeIn {
    pub nodes: Vec<NodeIn>,
    pub edges: Vec<EdgeIn>,
}

#[derive(Debug, Deserialize)]
pub struct NodeIn {
    pub id: i64,
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Deserialize)]
pub struct EdgeIn {
    pub from: i64,
    pub to: i64,
    pub length: f64,
}

#[derive(Debug, Serialize, PartialEq)]
pub struct Report {
    pub ok: bool,
    pub converged: bool,
    pub feasible: bool,
    pub scale: f64,
    pub error: Option<String>,
}

/// Map node coordinates uniformly into [0.1, 0.9] on both axes.
/// A single point (zero span) is placed at the centre.
fn normalise_coords(nodes: &[NodeIn]) -> Vec<(f64, f64)> {
    let fold = |f: fn(&NodeIn) -> f64| {
        nodes.iter().fold((f64::INFINITY, f64::NEG_INFINITY), |(lo, hi), n| {
            (lo.min(f(n)), hi.max(f(n)))
        })
    };
    let (x0, x1) = fold(|n| n.x);
    let (y0, y1) = fold(|n| n.y);
    let span = (x1 - x0).max(y1 - y0);
    let k = if span > 0.0 { 0.8 / span } else { 0.0 };
    let (cx, cy) = ((x0 + x1) / 2.0, (y0 + y1) / 2.0);
    nodes
        .iter()
        .map(|n| (0.5 + (n.x - cx) * k, 0.5 + (n.y - cy) * k))
        .collect()
}

/// Serialise a Fold tree to TreeMaker text.
///
/// treemaker-core has no tree constructor and its v5 reader does not rebuild
/// paths, so this writes the layout `Tree::from_tmd_str` reads for version
/// "4.0" (which runs the library's own cleanup), with every node pair as a
/// path. Indices are 1-based, in the order given in the JSON. Call
/// `Tree::to_tmd5_string` on the parsed result for canonical v5 text.
pub fn tree_to_tmd(tree: &TreeIn) -> Result<String, String> {
    let n = tree.nodes.len();
    if n < 2 {
        return Err("tree needs at least two nodes".into());
    }
    if tree.edges.len() != n - 1 {
        return Err(format!(
            "a tree with {n} nodes needs {} edges, got {}",
            n - 1,
            tree.edges.len()
        ));
    }
    let mut index_of: BTreeMap<i64, usize> = BTreeMap::new();
    for (i, node) in tree.nodes.iter().enumerate() {
        if !node.x.is_finite() || !node.y.is_finite() {
            return Err(format!("node {} has a non-finite coordinate", node.id));
        }
        if index_of.insert(node.id, i + 1).is_some() {
            return Err(format!("duplicate node id {}", node.id));
        }
    }
    // The optimiser starts from the node coordinates, which must lie inside
    // the paper. Fit them uniformly (aspect ratio kept, shorter axis centred)
    // into [0.1, 0.9]. Edge lengths are supplied separately and are untouched.
    let norm = normalise_coords(&tree.nodes);
    // adj[node] = (neighbour, edge index), all 1-based.
    let mut adj: Vec<Vec<(usize, usize)>> = vec![Vec::new(); n + 1];
    let mut edge_nodes = Vec::with_capacity(n - 1);
    for (i, e) in tree.edges.iter().enumerate() {
        let a = *index_of
            .get(&e.from)
            .ok_or_else(|| format!("edge references unknown node {}", e.from))?;
        let b = *index_of
            .get(&e.to)
            .ok_or_else(|| format!("edge references unknown node {}", e.to))?;
        if a == b {
            return Err(format!("edge {} is a self-loop", i + 1));
        }
        if !e.length.is_finite() || e.length <= 0.0 {
            return Err(format!("edge {} has non-positive length", i + 1));
        }
        adj[a].push((b, i + 1));
        adj[b].push((a, i + 1));
        edge_nodes.push((a, b));
    }

    // Path between every pair i<j by BFS from i; also proves connectivity.
    struct P {
        nodes: Vec<usize>,
        edges: Vec<usize>,
    }
    let mut paths: Vec<P> = Vec::new();
    for i in 1..=n {
        let mut prev: Vec<Option<(usize, usize)>> = vec![None; n + 1];
        let mut seen = vec![false; n + 1];
        seen[i] = true;
        let mut q = VecDeque::from([i]);
        while let Some(u) = q.pop_front() {
            for &(v, e) in &adj[u] {
                if !seen[v] {
                    seen[v] = true;
                    prev[v] = Some((u, e));
                    q.push_back(v);
                }
            }
        }
        for j in (i + 1)..=n {
            if !seen[j] {
                return Err("graph is not connected".into());
            }
            let (mut ns, mut es) = (vec![j], Vec::new());
            let mut cur = j;
            while let Some((p, e)) = prev[cur] {
                ns.push(p);
                es.push(e);
                cur = p;
            }
            ns.reverse();
            es.reverse();
            paths.push(P { nodes: ns, edges: es });
        }
    }

    let is_leaf = |v: usize| adj[v].len() == 1;
    let mut out = String::new();
    let mut line = |s: String| {
        out.push_str(&s);
        out.push('\n');
    };
    let b = |v: bool| if v { "true".to_string() } else { "false".to_string() };

    for s in ["tree", "4.0", "1.000000", "1.000000", "0.100000", "false", "0.000000", "0.000000", "0.000000"] {
        line(s.to_string());
    }
    // Header: nodes, edges, paths, polys, vertices, creases, conditions.
    for c in [n, n - 1, paths.len(), 0, 0, 0, 0] {
        line(c.to_string());
    }
    for i in 0..n {
        let idx = i + 1;
        line("node".into());
        line(idx.to_string());
        line(String::new()); // label
        line(format!("{:.6}", norm[i].0));
        line(format!("{:.6}", norm[i].1));
        line(b(is_leaf(idx)));
        for _ in 0..5 {
            line("false".into()); // sub, border, pinned, polygon, conditioned
        }
        line("0".into()); // owned vertices
        line(adj[idx].len().to_string());
        for &(_, e) in &adj[idx] {
            line(e.to_string());
        }
        let lp: Vec<usize> = paths
            .iter()
            .enumerate()
            .filter(|(_, p)| {
                is_leaf(idx)
                    && (p.nodes[0] == idx || *p.nodes.last().unwrap() == idx)
                    && is_leaf(p.nodes[0])
                    && is_leaf(*p.nodes.last().unwrap())
            })
            .map(|(k, _)| k + 1)
            .collect();
        line(lp.len().to_string());
        for k in lp {
            line(k.to_string());
        }
        line("0".into()); // owner: tree
    }
    for (i, e) in tree.edges.iter().enumerate() {
        line("edge".into());
        line((i + 1).to_string());
        line(String::new());
        line(format!("{:.6}", e.length));
        line("0.000000".into()); // strain
        line("1.000000".into()); // stiffness
        line("false".into());
        line("false".into());
        line("2".into());
        line(edge_nodes[i].0.to_string());
        line(edge_nodes[i].1.to_string());
    }
    for (k, p) in paths.iter().enumerate() {
        let len: f64 = p.edges.iter().map(|&e| tree.edges[e - 1].length).sum();
        let leaf = is_leaf(p.nodes[0]) && is_leaf(*p.nodes.last().unwrap());
        line("path".into());
        line((k + 1).to_string());
        line(format!("{:.6}", len));
        line(format!("{:.6}", len * 0.1));
        line(b(leaf));
        for _ in 0..5 {
            line("false".into()); // sub, active, border, polygon, conditioned
        }
        line("0".into()); // owned vertices
        line("0".into()); // fwd poly
        line("0".into()); // bkd poly
        line(p.nodes.len().to_string());
        for v in &p.nodes {
            line(v.to_string());
        }
        line(p.edges.len().to_string());
        for e in &p.edges {
            line(e.to_string());
        }
        line("0".into()); // owner: tree
    }
    let all = |c: usize| {
        let mut s = vec![c.to_string()];
        s.extend((1..=c).map(|v| v.to_string()));
        s
    };
    for l in all(n).into_iter().chain(all(n - 1)).chain(all(paths.len())) {
        line(l);
    }
    line("0".into()); // owned polys
    Ok(out)
}

/// Parse, optimise the scale, and build the crease pattern.
pub fn solve(tree: &TreeIn) -> Report {
    let mut report = Report { ok: false, converged: false, feasible: false, scale: 0.0, error: None };
    let fail = |mut r: Report, msg: String| {
        r.error = Some(msg);
        r
    };
    let tmd = match tree_to_tmd(tree) {
        Ok(t) => t,
        Err(e) => return fail(report, format!("serialise: {e}")),
    };
    // Parse the written text, re-emit canonical v5, and parse that, so the
    // optimiser runs on text the v5 reader accepts.
    let tmd5 = match Tree::from_tmd_str(&tmd) {
        Ok(t) => t.to_tmd5_string(),
        Err(e) => return fail(report, format!("parse: {e}")),
    };
    let mut t = match Tree::from_tmd_str(&tmd5) {
        Ok(t) => t,
        Err(e) => return fail(report, format!("parse v5: {e}")),
    };
    match t.optimize_scale() {
        Ok(r) => {
            report.converged = r.converged;
            report.feasible = r.is_feasible;
            report.scale = r.new_scale;
        }
        Err(e) => return fail(report, format!("optimize_scale: {e}")),
    }
    if let Err(e) = t.build_polys_and_crease_pattern() {
        return fail(report, format!("build_polys_and_crease_pattern: {e}"));
    }
    report.ok = true;
    report
}

fn main() {
    let mut input = String::new();
    let report = match std::io::stdin().read_to_string(&mut input) {
        Err(e) => Report { ok: false, converged: false, feasible: false, scale: 0.0, error: Some(format!("stdin: {e}")) },
        Ok(_) => match serde_json::from_str::<TreeIn>(&input) {
            Err(e) => Report { ok: false, converged: false, feasible: false, scale: 0.0, error: Some(format!("json: {e}")) },
            Ok(t) => solve(&t),
        },
    };
    println!("{}", serde_json::to_string(&report).unwrap());
    std::process::exit(if report.ok { 0 } else { 1 });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn star() -> TreeIn {
        serde_json::from_str(
            r#"{"nodes":[{"id":0,"x":0.5,"y":0.5},{"id":1,"x":0.1,"y":0.1},
                         {"id":2,"x":0.9,"y":0.1},{"id":3,"x":0.5,"y":0.9}],
                "edges":[{"from":0,"to":1,"length":1.0},{"from":0,"to":2,"length":1.0},
                         {"from":0,"to":3,"length":1.0}]}"#,
        )
        .unwrap()
    }

    #[test]
    fn star_round_trips_optimises_and_converges() {
        let tree = star();
        let tmd = tree_to_tmd(&tree).expect("serialise");
        let parsed = Tree::from_tmd_str(&tmd).expect("treemaker-core parses the text");
        let tmd5 = parsed.to_tmd5_string();
        let reparsed = Tree::from_tmd_str(&tmd5).expect("canonical v5 re-parses");
        assert_eq!(tmd5, reparsed.to_tmd5_string(), "v5 text is stable");

        let mut t = reparsed;
        let r = t.optimize_scale().expect("optimize_scale");
        assert!(r.converged, "did not converge: {}", r.message);
        assert!(r.new_scale > 0.0);
        t.build_polys_and_crease_pattern().expect("crease pattern");

        let report = solve(&tree);
        assert!(report.ok, "{:?}", report.error);
        assert!(report.converged);
    }

    fn tree_from(nodes: &[(f64, f64)], edges: &[(usize, usize)]) -> TreeIn {
        let len = |a: usize, b: usize| {
            ((nodes[a].0 - nodes[b].0).powi(2) + (nodes[a].1 - nodes[b].1).powi(2)).sqrt()
        };
        TreeIn {
            nodes: nodes.iter().enumerate().map(|(i, &(x, y))| NodeIn { id: i as i64, x, y }).collect(),
            edges: edges
                .iter()
                .map(|&(a, b)| EdgeIn { from: a as i64, to: b as i64, length: len(a, b) })
                .collect(),
        }
    }

    #[test]
    fn chain_outside_unit_square_converges_at_quarter_scale() {
        // Regression: raw coordinates 0,-1..-4 made the optimiser fail.
        let nodes: Vec<(f64, f64)> = (0..5).map(|i| (0.0, -(i as f64))).collect();
        let edges: Vec<(usize, usize)> = (0..4).map(|i| (i, i + 1)).collect();
        let r = solve(&tree_from(&nodes, &edges));
        assert!(r.ok, "{:?}", r.error);
        assert!(r.converged);
        assert!((r.scale - 0.25).abs() < 1e-3, "scale {}", r.scale);
    }

    #[test]
    fn four_legged_animal_outside_unit_square_converges() {
        // Regression: this tree timed out on raw coordinates.
        let nodes = [(0., 3.), (0., 1.), (0., -1.), (0., -3.), (-1., 0.), (1., 0.), (-1., -2.), (1., -2.)];
        let edges = [(0, 1), (1, 2), (2, 3), (1, 4), (1, 5), (2, 6), (2, 7)];
        let r = solve(&tree_from(&nodes, &edges));
        assert!(r.ok, "{:?}", r.error);
        assert!(r.converged);
        assert!(r.scale > 0.1, "scale {}", r.scale);
    }

    #[test]
    fn normalisation_fits_unit_square_keeps_aspect_and_edge_lengths() {
        let nodes = [(0., 3.), (0., 1.), (0., -1.), (0., -3.), (-1., 0.), (1., 0.)];
        let edges = [(0, 1), (1, 2), (2, 3), (1, 4), (1, 5)];
        let tree = tree_from(&nodes, &edges);
        let before: Vec<f64> = tree.edges.iter().map(|e| e.length).collect();
        let n = normalise_coords(&tree.nodes);
        for &(x, y) in &n {
            assert!((0.1 - 1e-12..=0.9 + 1e-12).contains(&x) && (0.1 - 1e-12..=0.9 + 1e-12).contains(&y));
        }
        // 6 units tall maps to 0.8; 2 units wide maps to 0.8/3.
        assert!((n[0].1 - n[3].1 - 0.8).abs() < 1e-12);
        assert!((n[5].0 - n[4].0 - 0.8 / 3.0).abs() < 1e-12);
        // Edge lengths written to the text are the supplied ones.
        let tmd = tree_to_tmd(&tree).unwrap();
        let parsed = Tree::from_tmd_str(&tmd).unwrap();
        assert!(parsed.to_tmd5_string().contains(&format!("{:.6}", before[0])));
    }

    #[test]
    fn rejects_disconnected_and_bad_input() {
        let mut t = star();
        t.edges[2].to = 1; // node 3 now unreachable
        assert!(tree_to_tmd(&t).is_err());
        let mut t = star();
        t.edges.pop();
        assert!(tree_to_tmd(&t).is_err());
    }
}
