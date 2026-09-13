import json
import os

import numpy as np
import pandas as pd
import requests
import scipy.sparse as sp
from dotenv import load_dotenv

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
FRONTEND_DIR = os.path.join(os.path.dirname(__file__), "..", "frontend")
ANNOTATIONS_PATH = os.path.join(DATA_DIR, "body-annotations-male-cns-v1.0-minconf-0.5.feather")
WEIGHTS_PATH = os.path.join(DATA_DIR, "connectome-weights-male-cns-v1.0-minconf-0.5.feather")
OUT_MATRIX_PATH = os.path.join(DATA_DIR, "circuit.npz")
OUT_META_PATH = os.path.join(DATA_DIR, "circuit_meta.json")
OUT_POSITIONS_PATH = os.path.join(FRONTEND_DIR, "brain_positions.json")

SCENE_SCALE = 6.0

NEUPRINT_SERVER = "https://neuprint.janelia.org"
NEUPRINT_DATASET = "male-cns:v1.0"

VISUAL_INPUT_TYPES = {"LC4", "LPLC1", "LPLC2"}
DN_OUTPUT_TYPES = {"DNp01", "DNp03"}
SEED_TYPES = VISUAL_INPUT_TYPES | DN_OUTPUT_TYPES

MIN_SYNAPSES = 5
NT_CHUNK_SIZE = 2000
INHIBITORY_NT = {"gaba", "glutamate"}


def fetch_predicted_nt(body_ids, token):
    headers = {"Authorization": f"Bearer {token}", "Content-type": "application/json"}
    nt_by_body = {}
    body_ids = [int(b) for b in body_ids]
    for start in range(0, len(body_ids), NT_CHUNK_SIZE):
        chunk = body_ids[start:start + NT_CHUNK_SIZE]
        cypher = (
            "MATCH (n:Neuron) WHERE n.bodyId IN "
            f"{json.dumps(chunk)} RETURN n.bodyId, n.predictedNt"
        )
        resp = requests.post(
            f"{NEUPRINT_SERVER}/api/custom/custom",
            json={"cypher": cypher, "dataset": NEUPRINT_DATASET},
            headers=headers,
        )
        resp.raise_for_status()
        payload = resp.json()
        for body_id, nt in payload["data"]:
            nt_by_body[body_id] = nt
    return nt_by_body


def main():
    load_dotenv()
    token = os.environ["NEUPRINT_TOKEN"]

    print("Loading annotations + weights...")
    ann = pd.read_feather(ANNOTATIONS_PATH)
    weights = pd.read_feather(WEIGHTS_PATH)

    seed_ids = set(ann.loc[ann["type"].isin(SEED_TYPES), "bodyId"])
    print(f"Seed neurons ({', '.join(sorted(SEED_TYPES))}): {len(seed_ids)}")

    strong = weights[weights["weight"] >= MIN_SYNAPSES]
    touches_seed = strong["body_pre"].isin(seed_ids) | strong["body_post"].isin(seed_ids)
    neighborhood_edges = strong[touches_seed]
    node_ids = set(neighborhood_edges["body_pre"]) | set(neighborhood_edges["body_post"]) | seed_ids
    print(f"Expanded node set (seed + direct partners, weight >= {MIN_SYNAPSES}): {len(node_ids)}")

    induced = strong[strong["body_pre"].isin(node_ids) & strong["body_post"].isin(node_ids)]
    print(f"Induced subgraph edges: {len(induced)}")

    node_ids = np.array(sorted(node_ids), dtype=np.int64)
    index_of = {bid: i for i, bid in enumerate(node_ids)}

    print("Fetching predictedNt from neuPrint for polarity (excitatory/inhibitory)...")
    nt_by_body = fetch_predicted_nt(node_ids, token)
    sign_of_body = {
        bid: (-1 if str(nt_by_body.get(bid, "")).lower() in INHIBITORY_NT else 1)
        for bid in node_ids
    }

    rows = induced["body_post"].map(index_of).to_numpy()
    cols = induced["body_pre"].map(index_of).to_numpy()
    signs = induced["body_pre"].map(sign_of_body).to_numpy()
    data = induced["weight"].to_numpy() * signs

    n = len(node_ids)
    W = sp.csr_matrix((data, (rows, cols)), shape=(n, n))
    sp.save_npz(OUT_MATRIX_PATH, W)

    ann_by_body = ann.set_index("bodyId")
    nodes_meta = []
    raw_positions = {}
    for i, bid in enumerate(node_ids):
        row = ann_by_body.loc[bid] if bid in ann_by_body.index else None
        ntype = row["type"] if row is not None else None
        if ntype in VISUAL_INPUT_TYPES:
            role = "visual_input"
        elif ntype in DN_OUTPUT_TYPES:
            role = "dn_output"
        else:
            role = "relay"
        nodes_meta.append({
            "index": i,
            "bodyId": int(bid),
            "type": ntype,
            "somaSide": row["somaSide"] if row is not None else None,
            "predictedNt": nt_by_body.get(int(bid)),
            "role": role,
        })
        loc = row["somaLocation"] if row is not None else None
        if isinstance(loc, np.ndarray):
            raw_positions[i] = loc.astype(np.float64)

    with open(OUT_META_PATH, "w") as f:
        json.dump({
            "min_synapses": MIN_SYNAPSES,
            "visual_input_types": sorted(VISUAL_INPUT_TYPES),
            "dn_output_types": sorted(DN_OUTPUT_TYPES),
            "nodes": nodes_meta,
        }, f)

    print(f"Saved {OUT_MATRIX_PATH} ({n} nodes, {W.nnz} directed edges)")
    print(f"Saved {OUT_META_PATH}")

    coords = np.stack(list(raw_positions.values()))
    center = (coords.min(axis=0) + coords.max(axis=0)) / 2.0
    span = float((coords.max(axis=0) - coords.min(axis=0)).max())
    scale = SCENE_SCALE / span

    role_by_index = {m["index"]: m["role"] for m in nodes_meta}
    positions_out = [
        {
            "index": i,
            "role": role_by_index[i],
            "x": round(float((loc[0] - center[0]) * scale), 4),
            "y": round(float((loc[1] - center[1]) * scale), 4),
            "z": round(float((loc[2] - center[2]) * scale), 4),
        }
        for i, loc in raw_positions.items()
    ]
    with open(OUT_POSITIONS_PATH, "w") as f:
        json.dump(positions_out, f)
    print(f"Saved {OUT_POSITIONS_PATH} ({len(positions_out)}/{n} neurons have a real soma position)")

    roles = pd.Series([m["role"] for m in nodes_meta])
    print("\nRole counts:")
    print(roles.value_counts().to_string())

    dn_rows = [m for m in nodes_meta if m["role"] == "dn_output"]
    for dn in dn_rows:
        in_deg = int((W[dn["index"], :] != 0).sum())
        out_deg = int((W[:, dn["index"]] != 0).sum())
        print(f"{dn['type']} (body {dn['bodyId']}, {dn['somaSide']}): in-degree={in_deg} out-degree={out_deg}")


if __name__ == "__main__":
    main()
