#!/usr/bin/env python3
"""CP-SAT solver for small semantic farm macro layouts.

Input is JSON matching the serializable portion of a V6 assembly specification.
Continuous sprite geometry stays in world-cell units; positions are selected from
the requested grid, with deterministic seed jitter and pairwise polygon SAT.
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from itertools import product
from pathlib import Path


def _project(poly, axis):
    values = [point[0] * axis[0] + point[1] * axis[1] for point in poly]
    return min(values), max(values)


def polygons_overlap(a, b):
    for polygon in (a, b):
        for index, point in enumerate(polygon):
            nxt = polygon[(index + 1) % len(polygon)]
            axis = (nxt[1] - point[1], point[0] - nxt[0])
            alo, ahi = _project(a, axis)
            blo, bhi = _project(b, axis)
            if ahi <= blo + 1e-8 or bhi <= alo + 1e-8:
                return False
    return True


def _stable_jitter(seed, item_id, x, y):
    # Deterministic integer hash, independent of Python's randomized hash().
    value = (seed ^ (x * 0x45D9F3B) ^ (y * 0x119DE1F3)) & 0xFFFFFFFF
    for char in item_id.encode("utf-8"):
        value = ((value ^ char) * 0x01000193) & 0xFFFFFFFF
    value ^= value >> 16
    return (value / 0xFFFFFFFF) * 0.17


def _translated(poly, x, y):
    return [[point["x"] + x, point["y"] + y] for point in poly]


def _point_inside(point, polygon):
    point = [point["x"], point["y"]] if isinstance(point, dict) else point
    polygon = [[item["x"], item["y"]] if isinstance(item, dict) else item for item in polygon]
    inside = False
    for index, current in enumerate(polygon):
        previous = polygon[index - 1]
        if ((current[1] > point[1]) != (previous[1] > point[1])
                and point[0] < (previous[0] - current[0]) * (point[1] - current[1])
                / (previous[1] - current[1]) + current[0]):
            inside = not inside
    return inside


def _max_polygon_slope(slope_grid, columns, rows, polygon, anchor):
    samples = list(polygon)
    samples.append(anchor)
    min_x = max(0, math.floor(min(point[0] for point in polygon)))
    max_x = min(columns, math.ceil(max(point[0] for point in polygon)))
    min_y = max(0, math.floor(min(point[1] for point in polygon)))
    max_y = min(rows, math.ceil(max(point[1] for point in polygon)))
    for y in range(min_y, max_y):
        for x in range(min_x, max_x):
            center = (x + 0.5, y + 0.5)
            if _point_inside(center, polygon):
                samples.append(center)
    return max(abs(slope_grid[min(rows - 1, max(0, int(y)))][min(columns - 1, max(0, int(x)))])
               for x, y in samples)


def _is_incompatible(a, b):
    return bool(set(a.get("incompatibleTags", [])) & set(b.get("tags", []))
                or set(b.get("incompatibleTags", [])) & set(a.get("tags", [])))


def build_candidates(spec, seed):
    terrain = spec["terrain"]
    columns, rows = terrain["columns"], terrain["rows"]
    ordered = sorted(spec["structures"], key=lambda item: (-item.get("priority", 0), item["id"]))
    domains = {}
    domain_stats = {}
    for item in ordered:
        poly = item.get("collisionPolygon")
        if not poly or len(poly) < 3:
            raise ValueError(f"{item['id']}: collisionPolygon with >=3 points is required")
        step = max(1, int(item.get("gridStep", 1)))
        zone = item.get("zone", {"left": 1, "right": columns - 1, "top": 1, "bottom": rows - 1})
        target = item.get("target", {"x": 0.5, "y": 0.5})
        candidates = []
        for row in range(1, rows - 1, step):
            for column in range(1, columns - 1, step):
                # Keep the world-cell candidate grid fixed across seeds. Seed
                # variation is expressed in the objective, allowing batch runs
                # to reuse the exact same hard-constraint model.
                x = float(column)
                y = float(row)
                if x < zone.get("left", 0) or x > zone.get("right", columns):
                    continue
                if y < zone.get("top", 0) or y > zone.get("bottom", rows):
                    continue
                world = _translated(poly, x, y)
                if min(p[0] for p in world) < 0 or min(p[1] for p in world) < 0:
                    continue
                if max(p[0] for p in world) > columns or max(p[1] for p in world) > rows:
                    continue
                if "slopeGrid" in terrain:
                    slope = _max_polygon_slope(terrain["slopeGrid"], columns, rows, world, (x, y))
                    if slope > item.get("maxSlope", 0.12):
                        continue
                access = item.get("access")
                access_point = None
                if access:
                    access_point = [x + access.get("offset", {}).get("x", 0),
                                    y + access.get("offset", {}).get("y", 0)]
                    targets = access.get("targets", [])
                    if access.get("required", True) and not targets:
                        raise ValueError(f"{item['id']}: required access needs one or more world-cell targets")
                    if targets:
                        nearest = min(math.hypot(access_point[0] - target["x"], access_point[1] - target["y"])
                                      for target in targets)
                        if nearest > access.get("maxDistance", 1.0):
                            continue
                score = candidate_score(item, x, y, columns, rows, seed)
                candidates.append({"x": x, "y": y, "poly": world, "accessPoint": access_point, "score": score})
        candidates.sort(key=lambda candidate: (candidate["score"], candidate["y"], candidate["x"]))
        configured_limit = item.get("candidateLimit")
        limit = max(1, int(configured_limit)) if configured_limit is not None else len(candidates)
        domains[item["id"]] = candidates[:limit]
        domain_stats[item["id"]] = {"enumerated": len(candidates), "retained": len(domains[item["id"]]),
                                     "complete": len(candidates) <= limit, "limit": configured_limit}
        if not domains[item["id"]]:
            raise ValueError(f"{item['id']}: no candidate satisfies bounds, zone, slope")
    return ordered, domains, domain_stats


def candidate_score(item, x, y, columns, rows, seed):
    target = item.get("target", {"x": 0.5, "y": 0.5})
    dx = x / columns - target.get("x", 0.5)
    dy = y / rows - target.get("y", 0.5)
    score = math.hypot(dx * columns, dy * rows) * item.get("targetWeight", 0.2)
    score += abs(dx) + abs(dy)
    # Seed changes tie-breaking and small-scale variation, while the target and
    # hard-constraint model stay stable so batch solves can reuse that model.
    score += _stable_jitter(seed, item["id"] + ":score", int(x), int(y)) * item.get("variation", 1.2)
    return score


def build_model(ordered, domains):
    from ortools.sat.python import cp_model
    model = cp_model.CpModel()
    choices = {}
    for item in ordered:
        literals = []
        for index, _candidate in enumerate(domains[item["id"]]):
            literal = model.NewBoolVar(f"place_{item['id']}_{index}")
            choices[item["id"], index] = literal
            literals.append(literal)
        model.AddExactlyOne(literals)

    # Hard physical non-overlap and incompatible-tag clearance constraints.
    # The unit-cell spatial hash is a conservative broad phase; exact geometry
    # remains the final decision for every pair the broad phase returns.
    for i, first in enumerate(ordered):
        for second in ordered[i + 1:]:
            first_domain, second_domain = domains[first["id"]], domains[second["id"]]
            incompatible = _is_incompatible(first, second)
            minimum_clearance = max(first.get("clearance", 0), second.get("clearance", 0)) if incompatible else 0
            buckets = defaultdict(list)

            def conflict_bounds(candidate):
                xs = [point[0] for point in candidate["poly"]]
                ys = [point[1] for point in candidate["poly"]]
                left, right, top, bottom = min(xs), max(xs), min(ys), max(ys)
                point = candidate["accessPoint"]
                if point is not None:
                    left, right = min(left, point[0]), max(right, point[0])
                    top, bottom = min(top, point[1]), max(bottom, point[1])
                if minimum_clearance:
                    half = minimum_clearance / 2
                    left, right = min(left, candidate["x"] - half), max(right, candidate["x"] + half)
                    top, bottom = min(top, candidate["y"] - half), max(bottom, candidate["y"] + half)
                return left, top, right, bottom

            def bucket_cells(box):
                left, top, right, bottom = box
                x0, y0 = math.floor(left), math.floor(top)
                x1, y1 = math.floor(right - 1e-9), math.floor(bottom - 1e-9)
                if x1 < x0: x1 = x0
                if y1 < y0: y1 = y0
                return product(range(x0, x1 + 1), range(y0, y1 + 1))

            for bi, candidate in enumerate(second_domain):
                for cell in bucket_cells(conflict_bounds(candidate)):
                    buckets[cell].append(bi)
            for ai, a in enumerate(first_domain):
                possible = set()
                for cell in bucket_cells(conflict_bounds(a)):
                    possible.update(buckets.get(cell, ()))
                for bi in sorted(possible):
                    b = second_domain[bi]
                    collision = first.get("blocking", True) is not False and second.get("blocking", True) is not False and polygons_overlap(a["poly"], b["poly"])
                    access_blocked = ((a["accessPoint"] is not None and second.get("blocking", True) is not False and _point_inside(a["accessPoint"], b["poly"]))
                                      or (b["accessPoint"] is not None and first.get("blocking", True) is not False and _point_inside(b["accessPoint"], a["poly"])))
                    clearance = incompatible and math.hypot(a["x"] - b["x"], a["y"] - b["y"]) < minimum_clearance
                    if collision or access_blocked or clearance:
                        model.Add(choices[first["id"], ai] + choices[second["id"], bi] <= 1)
    return model, choices


def solve(spec, seed=1, time_limit=10.0, workers=1, prepared=None):
    try:
        from ortools.sat.python import cp_model
    except ImportError as exc:
        return {"valid": False, "reason": "ortools-unavailable", "detail": str(exc)}

    if prepared is None:
        ordered, domains, domain_stats = build_candidates(spec, seed)
        model, choices = build_model(ordered, domains)
    else:
        ordered, domains, domain_stats, model, choices = prepared
    objective_terms = []
    score_scale = 10000
    for item in ordered:
        for index, candidate in enumerate(domains[item["id"]]):
            candidate["score"] = candidate_score(item, candidate["x"], candidate["y"],
                                                  spec["terrain"]["columns"], spec["terrain"]["rows"], seed)
            objective_terms.append(round(candidate["score"] * score_scale) * choices[item["id"], index])

    model.ClearObjective()
    model.Minimize(sum(objective_terms))
    solver = cp_model.CpSolver()
    solver.parameters.max_time_in_seconds = max(0.1, float(time_limit))
    solver.parameters.num_search_workers = max(1, int(workers))
    solver.parameters.random_seed = int(seed) & 0x7FFFFFFF
    status = solver.Solve(model)
    if status not in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        return {"valid": False, "reason": "no-feasible-layout" if status == cp_model.INFEASIBLE else "solver-unknown",
                "solverStatus": solver.StatusName(status), "candidateCounts": {key: len(value) for key, value in domains.items()}}
    placements = []
    for item in ordered:
        index = next(i for i in range(len(domains[item["id"]])) if solver.Value(choices[item["id"], i]))
        candidate = domains[item["id"]][index]
        placements.append({"id": item["id"], "assetId": item.get("assetId"), "position": {"x": candidate["x"], "y": candidate["y"]},
                           "worldPolygon": [{"x": x, "y": y} for x, y in candidate["poly"]],
                           "accessPoint": ({"x": candidate["accessPoint"][0], "y": candidate["accessPoint"][1]} if candidate["accessPoint"] is not None else None),
                           "blocking": item.get("blocking", True), "clearance": item.get("clearance", 0),
                           "incompatibleTags": item.get("incompatibleTags", []), "status": "accepted"})
    # Defense in depth: verify the returned assignment independently of the
    # Boolean model before marking it accepted.
    hard_violations = []
    placement_by_id = {placement["id"]: placement for placement in placements}
    for item in ordered:
        placement = placement_by_id[item["id"]]
        polygon = placement["worldPolygon"]
        if (min(point["x"] for point in polygon) < -1e-8 or min(point["y"] for point in polygon) < -1e-8
                or max(point["x"] for point in polygon) > spec["terrain"]["columns"] + 1e-8
                or max(point["y"] for point in polygon) > spec["terrain"]["rows"] + 1e-8):
            hard_violations.append({"type": "bounds", "objectId": item["id"]})
        if "slopeGrid" in spec["terrain"]:
            steepest = _max_polygon_slope(spec["terrain"]["slopeGrid"], spec["terrain"]["columns"],
                                          spec["terrain"]["rows"],
                                          [[point["x"], point["y"]] for point in polygon],
                                          [placement["position"]["x"], placement["position"]["y"]])
            if steepest > item.get("maxSlope", 0.12) + 1e-8:
                hard_violations.append({"type": "terrain-slope", "objectId": item["id"], "slope": steepest})
        access = item.get("access")
        if access and access.get("required", True):
            point = placement.get("accessPoint")
            targets = access.get("targets", [])
            if point is None or not targets or min(math.hypot(point["x"] - target["x"], point["y"] - target["y"]) for target in targets) > access.get("maxDistance", 1.0) + 1e-8:
                hard_violations.append({"type": "access-radius", "objectId": item["id"]})
    for index, first in enumerate(ordered):
        a = placement_by_id[first["id"]]
        for second in ordered[index + 1:]:
            b = placement_by_id[second["id"]]
            a_poly = [[point["x"], point["y"]] for point in a["worldPolygon"]]
            b_poly = [[point["x"], point["y"]] for point in b["worldPolygon"]]
            if first.get("blocking", True) is not False and second.get("blocking", True) is not False and polygons_overlap(a_poly, b_poly):
                hard_violations.append({"type": "polygon-overlap", "pair": [first["id"], second["id"]]})
            if _is_incompatible(first, second) and math.hypot(a["position"]["x"] - b["position"]["x"], a["position"]["y"] - b["position"]["y"]) < max(first.get("clearance", 0), second.get("clearance", 0)) - 1e-8:
                hard_violations.append({"type": "incompatible-clearance", "pair": [first["id"], second["id"]]})
            if a.get("accessPoint") and second.get("blocking", True) is not False and _point_inside([a["accessPoint"]["x"], a["accessPoint"]["y"]], b["worldPolygon"]):
                hard_violations.append({"type": "access-blocked", "objectId": first["id"], "blockerId": second["id"]})
            if b.get("accessPoint") and first.get("blocking", True) is not False and _point_inside([b["accessPoint"]["x"], b["accessPoint"]["y"]], a["worldPolygon"]):
                hard_violations.append({"type": "access-blocked", "objectId": second["id"], "blockerId": first["id"]})
    if hard_violations:
        return {"valid": False, "reason": "solver-postcheck-failed", "solverStatus": solver.StatusName(status),
                "hardViolations": hard_violations}
    domains_complete = all(item["complete"] for item in domain_stats.values())
    solver_status = solver.StatusName(status)
    optimization_scope = ("complete-generated-discrete-domain" if domains_complete
                          else "truncated-generated-candidate-domains")
    if status == cp_model.OPTIMAL:
        optimality = ("optimal-quantized-discrete-domain" if domains_complete
                      else "optimal-quantized-within-truncated-candidate-domains")
        proof_status = "proven-optimal"
    else:
        optimality = "feasible-time-limit"
        proof_status = "feasible-no-optimality-proof"
    optimization_proof = {
        "status": proof_status,
        "solverStatus": solver_status,
        "objective": "sum(round(candidate_score * scoreScale))",
        "scoreScale": score_scale,
        "scope": optimization_scope,
        "candidateDomainComplete": domains_complete,
        "claim": ("OPTIMAL for the integer-scaled objective over the complete generated discrete candidate domain"
                  if status == cp_model.OPTIMAL and domains_complete else
                  "OPTIMAL for the integer-scaled objective over retained candidates only; candidate generation truncated the domain"
                  if status == cp_model.OPTIMAL else
                  "No optimality claim; solver returned a feasible assignment before proving optimality"),
        "unroundedFloatScoreOptimality": False,
    }
    return {"valid": True, "seed": int(seed) & 0xFFFFFFFF, "score": solver.ObjectiveValue() / score_scale,
            "optimality": optimality, "optimizationProof": optimization_proof,
            "objectiveInteger": int(round(solver.ObjectiveValue())), "scoreScale": score_scale,
            "candidateDomainComplete": domains_complete,
            "candidateDomainStats": domain_stats,
            "hardConstraintsPassed": ["world-bounds", "terrain-slope", "polygon-non-overlap", "incompatible-clearance", "access-socket-radius", "access-approach-unblocked"],
            "solverStatus": solver_status, "wallTimeSeconds": solver.WallTime(),
            "candidateCounts": {key: len(value) for key, value in domains.items()}, "placements": placements}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output")
    parser.add_argument("--seed", type=int, default=1)
    parser.add_argument("--seeds", help="batch seeds as comma-separated values or an inclusive start:end range")
    parser.add_argument("--time-limit", type=float, default=10.0)
    parser.add_argument("--workers", type=int, default=1)
    args = parser.parse_args()
    try:
        specification = json.loads(Path(args.input).read_text())
        if args.seeds:
            if ":" in args.seeds:
                start, end = (int(part) for part in args.seeds.split(":", 1))
                if end < start:
                    raise ValueError("batch seed range end must be >= start")
                seeds = list(range(start, end + 1))
            else:
                seeds = [int(part) for part in args.seeds.split(",") if part.strip()]
            if not seeds:
                raise ValueError("batch must include at least one seed")
            can_reuse_model = all(item.get("candidateLimit") is None for item in specification.get("structures", []))
            prepared = None
            if can_reuse_model:
                ordered, domains, domain_stats = build_candidates(specification, seeds[0])
                model, choices = build_model(ordered, domains)
                prepared = (ordered, domains, domain_stats, model, choices)
            results = [solve(specification, seed, args.time_limit, args.workers, prepared=prepared) for seed in seeds]
            for seed, item in zip(seeds, results):
                item.setdefault("seed", seed)
            accepted = sum(result.get("valid", False) for result in results)
            result = {"valid": accepted == len(results), "batch": True, "seedCount": len(results),
                      "acceptedCount": accepted, "rejectedCount": len(results) - accepted,
                      "reusedHardConstraintModel": prepared is not None, "results": results}
        else:
            result = solve(specification, args.seed, args.time_limit, args.workers)
    except (OSError, ValueError, KeyError, TypeError) as exc:
        result = {"valid": False, "reason": "invalid-input", "detail": str(exc)}
    encoded = json.dumps(result, indent=2) + "\n"
    if args.output:
        Path(args.output).write_text(encoded)
    else:
        print(encoded, end="")
    if not result.get("valid"):
        sys.exit(2)


if __name__ == "__main__":
    main()
