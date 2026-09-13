import json
import os
from collections import deque

import numpy as np
import scipy.sparse as sp

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
MATRIX_PATH = os.path.join(DATA_DIR, "circuit.npz")
META_PATH = os.path.join(DATA_DIR, "circuit_meta.json")

WEIGHT_GAIN = 1.0 / 400.0
TAU_MS = 10.0
V_REST = 0.0
V_THRESH = 1.0
V_RESET = 0.0
REFRACTORY_MS = 3.0
SPIKE_WINDOW_MS = 50.0


def load_circuit(matrix_path=MATRIX_PATH, meta_path=META_PATH):
    W = sp.load_npz(matrix_path).tocsr().astype(np.float64) * WEIGHT_GAIN
    with open(meta_path) as f:
        meta = json.load(f)
    return W, meta["nodes"]


class LIFNetwork:
    def __init__(self, W=None, nodes=None):
        if W is None or nodes is None:
            W, nodes = load_circuit()
        self.W = W
        self.nodes = nodes
        self.n = len(self.nodes)

        self.visual_input_idx = np.array(
            [m["index"] for m in self.nodes if m["role"] == "visual_input"], dtype=np.int64
        )
        self.dn_output_idx = np.array(
            [m["index"] for m in self.nodes if m["role"] == "dn_output"], dtype=np.int64
        )
        self.dn_by_type_side = {}
        for m in self.nodes:
            if m["role"] == "dn_output":
                key = f"{m['type']}_{m['somaSide']}"
                self.dn_by_type_side.setdefault(key, []).append(m["index"])

        self.reset()

    def reset(self):
        self.V = np.full(self.n, V_REST, dtype=np.float64)
        self.refractory_until = np.zeros(self.n, dtype=np.float64)
        self.I_ext = np.zeros(self.n, dtype=np.float64)
        self.spikes = np.zeros(self.n, dtype=np.float64)
        self.t = 0.0
        self._spike_log = deque()
        self._batch_spikes = set()

    def inject(self, node_indices, current):
        if len(node_indices):
            self.I_ext[node_indices] += current

    def step(self, dt_ms=1.0):
        I_syn = self.W @ self.spikes
        dV = (dt_ms / TAU_MS) * (-(self.V - V_REST) + I_syn + self.I_ext)
        self.V += dV
        self.V[self.t < self.refractory_until] = V_RESET

        can_spike = self.t >= self.refractory_until
        spiking = can_spike & (self.V >= V_THRESH)

        self.spikes = spiking.astype(np.float64)
        self.V[spiking] = V_RESET
        self.refractory_until[spiking] = self.t + REFRACTORY_MS

        self.t += dt_ms
        self.I_ext[:] = 0.0

        if spiking.any():
            spiked_idx = np.flatnonzero(spiking)
            for idx in spiked_idx:
                self._spike_log.append((self.t, idx))
            self._batch_spikes.update(spiked_idx.tolist())
        cutoff = self.t - SPIKE_WINDOW_MS
        while self._spike_log and self._spike_log[0][0] < cutoff:
            self._spike_log.popleft()

    def drain_batch_spikes(self):
        spiked = list(self._batch_spikes)
        self._batch_spikes.clear()
        return spiked

    def spike_counts(self, node_indices, window_ms=SPIKE_WINDOW_MS):
        cutoff = self.t - window_ms
        idx_set = set(node_indices.tolist()) if len(node_indices) else set()
        return sum(1 for (t, idx) in self._spike_log if t >= cutoff and idx in idx_set)

    def dn_activity(self, window_ms=SPIKE_WINDOW_MS):
        return {
            key: self.spike_counts(np.array(idxs), window_ms)
            for key, idxs in self.dn_by_type_side.items()
        }


if __name__ == "__main__":
    net = LIFNetwork()
    print(f"Loaded circuit: {net.n} neurons, {net.W.nnz} edges")
    print(f"Visual input population: {len(net.visual_input_idx)} neurons")
    print(f"DN output population: {len(net.dn_output_idx)} neurons -> {list(net.dn_by_type_side.keys())}")

    print("\nInjecting sustained strong current into visual_input population for 200ms...")
    for step_i in range(200):
        net.inject(net.visual_input_idx, 2.0)
        net.step(dt_ms=1.0)
        if step_i % 20 == 0:
            batch = net.drain_batch_spikes()
            print(f"t={net.t:5.0f}ms  dn_activity={net.dn_activity()}  batch_spikes={len(batch)} sample={batch[:8]}")

    print("\nFinal DN activity (spikes in trailing 50ms):", net.dn_activity())
    if sum(net.dn_activity().values()) == 0:
        print("WARNING: DN population never fired -- increase WEIGHT_GAIN/current or lower V_THRESH.")
    else:
        print("DN population fired in response to visual input -- circuit is responsive.")
