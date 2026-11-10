"""sim-tools MCP server (stdio): eval_suite, run_episode, render_clip.

Newline-delimited JSON-RPC 2.0, no SDK. stdout carries protocol messages only; simulator output goes to stderr.
Each tool returns a small JSON object, never a log. Simulated, not a physical fold.

    sim/.venv/bin/python sim/mcp_server.py             # serve on stdio
    sim/.venv/bin/python sim/mcp_server.py --selftest  # initialize, tools/list, tools/call eval_suite
"""
import os
os.environ.setdefault("MUJOCO_GL", "egl")  # before importing mujoco

import contextlib
import json
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, HERE)

SERVER_INFO = {"name": "sim-tools", "version": "0.1.0"}
SUPPORTED_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"]
CLIP_FRAMES = 30
OUT_DIR = os.path.join(HERE, "out")


class ToolError(Exception):
    pass


class RpcError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


TOOLS = [
    {
        "name": "eval_suite",
        "description": "Run N seeded simulated towel folds with the scripted policy; return counts, not a log. "
                       "Run i of seed s draws its drop from rng seed s+i. Yaw 0, position only.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "runs": {"type": "integer", "minimum": 1, "maximum": 20, "description": "Default 10 (about 15 s)."},
                "seed": {"type": "integer", "minimum": 0, "description": "Default 1."},
                "policy": {"type": "string", "enum": ["scripted"], "description": "Default scripted."},
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "run_episode",
        "description": "Run one simulated drop and return the fold check numbers: width (x1/x0, need >= 0.90), "
                       "depth (y1/y0, need <= 0.60), ontop (m, need >= 0.002).",
        "inputSchema": {
            "type": "object",
            "properties": {
                "seed": {"type": "integer", "minimum": 0, "description": "Names the drop. Default 1."},
                "policy": {"type": "string", "enum": ["scripted", "relative"], "description": "Default scripted."},
            },
            "additionalProperties": False,
        },
    },
    {
        "name": "render_clip",
        "description": f"Render a short {CLIP_FRAMES}-frame mp4 of the scripted fold (inside camera). The path must be under sim/out/.",
        "inputSchema": {
            "type": "object",
            "properties": {"out": {"type": "string", "description": "Default sim/out/clip.mp4."}},
            "additionalProperties": False,
        },
    },
]


def _int(args, key, default, lo, hi):
    v = args.get(key, default)
    if isinstance(v, bool) or not isinstance(v, int) or not lo <= v <= hi:
        raise ToolError(f"`{key}` must be an integer from {lo} to {hi}")
    return v


def _policy(args, allowed):
    p = args.get("policy", "scripted")
    if p not in allowed:
        raise ToolError(f"`policy` must be one of {list(allowed)}")
    return p


def _check_args(args, allowed):
    extra = set(args) - set(allowed)
    if extra:
        raise ToolError(f"unknown argument(s): {sorted(extra)}")


def _num(x):
    x = float(x)
    return None if x != x else round(x, 4)   # NaN -> null (JSON has no NaN)


def eval_suite(args):
    _check_args(args, ("runs", "seed", "policy"))
    runs, seed = _int(args, "runs", 10, 1, 20), _int(args, "seed", 1, 0, 10**6)
    _policy(args, ("scripted",))
    import eval as sim_eval   # in-process; sim/eval.py
    import numpy as np
    t0 = time.time()
    with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(sys.stderr):
        rows = sim_eval.evaluate(runs, seed, tmp)
    ran = [r for r in rows if r["result"] != "NOREACH"]
    return {
        "success": sim_eval.nfolded(rows),
        "runs": runs,
        "distinct_drops": len({(round(r["dx"], 9), round(r["dy"], 9)) for r in rows}),
        "mean_time": _num(np.mean([r["time"] for r in ran])) if ran else None,
        "mean_wrinkle": _num(np.mean([r["wrinkle"] for r in ran])) if ran else None,
        "seconds": round(time.time() - t0, 1),
    }


def run_episode(args):
    _check_args(args, ("seed", "policy"))
    seed = _int(args, "seed", 1, 0, 10**6)
    pol = _policy(args, ("scripted", "relative"))
    import eval as sim_eval
    t0 = time.time()
    with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(sys.stderr):
        r = sim_eval.one(0, seed, tmp, D=sim_eval.D_CHOSEN if pol == "relative" else None)
    return {"result": r["result"], "width": _num(r["width"]), "depth": _num(r["depth"]),
            "ontop": _num(r["ontop"]), "seconds": round(time.time() - t0, 1)}


def render_clip(args):
    _check_args(args, ("out",))
    out = args.get("out", "sim/out/clip.mp4")
    if not isinstance(out, str) or not out.endswith(".mp4"):
        raise ToolError("`out` must be a path ending in .mp4")
    full = os.path.realpath(out if os.path.isabs(out) else os.path.join(ROOT, out))
    if os.path.commonpath([full, os.path.realpath(OUT_DIR)]) != os.path.realpath(OUT_DIR):
        raise ToolError("`out` must be under sim/out/")
    import video
    with contextlib.redirect_stdout(sys.stderr):
        n, _, wall, _ = video.render(full, CLIP_FRAMES)
    return {"path": os.path.relpath(full, ROOT), "frames": n, "seconds": round(wall, 1)}


IMPL = {"eval_suite": eval_suite, "run_episode": run_episode, "render_clip": render_clip}


def handle(method, params):
    if method == "initialize":
        asked = params.get("protocolVersion")
        return {
            "protocolVersion": asked if asked in SUPPORTED_PROTOCOLS else SUPPORTED_PROTOCOLS[0],
            "capabilities": {"tools": {"listChanged": False}},
            "serverInfo": SERVER_INFO,
            "instructions": "Simulated laundry-fold tools. Ask for counts: eval_suite, run_episode, render_clip.",
        }
    if method == "ping":
        return {}
    if method == "tools/list":
        return {"tools": TOOLS}
    if method == "tools/call":
        name = params.get("name")
        if name not in IMPL:
            raise RpcError(-32602, f"unknown tool {name!r}")
        args = params.get("arguments") or {}
        if not isinstance(args, dict):
            raise RpcError(-32602, "`arguments` must be an object")
        try:
            result = IMPL[name](args)
            return {"content": [{"type": "text", "text": json.dumps(result)}], "isError": False}
        except ToolError as e:
            return {"content": [{"type": "text", "text": str(e)}], "isError": True}
        except Exception as e:   # a simulator fault is a tool error, not a dead server
            return {"content": [{"type": "text", "text": f"internal error: {type(e).__name__}: {e}"}], "isError": True}
    raise RpcError(-32601, f"method not found: {method}")


def respond(line):
    """One input line -> one output object, or None for notifications and blank lines."""
    if not line.strip():
        return None
    try:
        msg = json.loads(line)
    except ValueError:
        return {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": "parse error"}}
    if not isinstance(msg, dict) or not isinstance(msg.get("method"), str):
        return None
    rid = msg.get("id")
    try:
        result = handle(msg["method"], msg.get("params") or {})
    except RpcError as e:
        return None if rid is None else {"jsonrpc": "2.0", "id": rid, "error": {"code": e.code, "message": str(e)}}
    except Exception as e:
        return None if rid is None else {"jsonrpc": "2.0", "id": rid, "error": {"code": -32603, "message": str(e)}}
    return None if rid is None else {"jsonrpc": "2.0", "id": rid, "result": result}


def selftest():
    calls = [
        {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"protocolVersion": SUPPORTED_PROTOCOLS[0]}},
        {"jsonrpc": "2.0", "id": 2, "method": "tools/list"},
        {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {"name": "eval_suite", "arguments": {"runs": 2, "seed": 11}}},
    ]
    outs = []
    for c in calls:
        o = respond(json.dumps(c))
        print(json.dumps(o))
        outs.append(o)
    ok = all(o and o.get("jsonrpc") == "2.0" and o.get("id") == c["id"] and "result" in o for o, c in zip(outs, calls))
    ok = ok and outs[0]["result"]["serverInfo"]["name"] == "sim-tools"
    ok = ok and [t["name"] for t in outs[1]["result"]["tools"]] == list(IMPL)
    if ok:
        r = outs[2]["result"]
        ok = not r["isError"] and set(json.loads(r["content"][0]["text"])) == {
            "success", "runs", "distinct_drops", "mean_time", "mean_wrinkle", "seconds"}
    if not ok:
        print("SELFTEST FAIL: malformed response", file=sys.stderr)
    return 0 if ok else 1


def main():
    if "--selftest" in sys.argv[1:]:
        return selftest()
    for line in sys.stdin:
        o = respond(line)
        if o is not None:
            sys.stdout.write(json.dumps(o) + "\n")
            sys.stdout.flush()
    return 0


if __name__ == "__main__":
    sys.exit(main())
