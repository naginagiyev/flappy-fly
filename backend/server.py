import asyncio
import json

import websockets

from brain import LIFNetwork, load_circuit

HOST = "localhost"
PORT = 8765

SIM_DT_MS = 2.0
SIM_STEPS_PER_FRAME = 8
SPIKE_WINDOW_MS = 50.0

STIMULUS_GAIN = 4.0
PROXIMITY_RANGE = 1.0
GROUND_DANGER_START = 0.85

FLAP_THRESHOLD = 4
COOLDOWN_MS = 130.0

MAX_SPIKED_PER_FRAME = 4000


def compute_loom(state):
    bird_y = state["bird_y"]
    gap_top = state["gap_top"]
    gap_bottom = state["gap_bottom"]
    pipe_dx = state["pipe_dx"]

    gap_center = (gap_top + gap_bottom) / 2.0
    gap_half = max((gap_bottom - gap_top) / 2.0, 1e-6)
    below_center = max(0.0, (bird_y - gap_center) / gap_half)
    below_center = min(below_center, 1.0)

    proximity = max(0.0, 1.0 - pipe_dx / PROXIMITY_RANGE)
    proximity = min(proximity, 1.0)
    pipe_loom = proximity * below_center

    ground_loom = max(0.0, (bird_y - GROUND_DANGER_START) / (1.0 - GROUND_DANGER_START))
    ground_loom = min(ground_loom, 1.0)

    return max(pipe_loom, ground_loom)


class ClientSession:
    def __init__(self, W, nodes):
        self.net = LIFNetwork(W, nodes)
        self.prev_alive = True
        self.last_flap_ms = -1e9

    def handle_state(self, state):
        alive = state.get("alive", True)
        if alive and not self.prev_alive:
            self.net.reset()
            self.last_flap_ms = -1e9
        self.prev_alive = alive

        loom = compute_loom(state) if alive else 0.0
        current = loom * STIMULUS_GAIN

        for _ in range(SIM_STEPS_PER_FRAME):
            if current > 0:
                self.net.inject(self.net.visual_input_idx, current)
            self.net.step(dt_ms=SIM_DT_MS)

        activity = self.net.dn_activity(window_ms=SPIKE_WINDOW_MS)
        dn01_total = activity.get("DNp01_L", 0) + activity.get("DNp01_R", 0)
        dn03_total = activity.get("DNp03_L", 0) + activity.get("DNp03_R", 0)
        flap_score = dn01_total + dn03_total

        now_ms = self.net.t
        flap = False
        if alive and flap_score >= FLAP_THRESHOLD and (now_ms - self.last_flap_ms) >= COOLDOWN_MS:
            flap = True
            self.last_flap_ms = now_ms

        visual_count = self.net.spike_counts(self.net.visual_input_idx, SPIKE_WINDOW_MS)
        spiked = self.net.drain_batch_spikes()
        if len(spiked) > MAX_SPIKED_PER_FRAME:
            spiked = spiked[:MAX_SPIKED_PER_FRAME]
        return {
            "flap": flap,
            "activity": {
                "visual": visual_count,
                **activity,
            },
            "spiked": spiked,
        }


async def handler(websocket, W, nodes):
    session = ClientSession(W, nodes)
    async for raw in websocket:
        try:
            state = json.loads(raw)
        except json.JSONDecodeError:
            continue
        reply = session.handle_state(state)
        await websocket.send(json.dumps(reply))


async def main():
    print("Loading circuit...")
    W, nodes = load_circuit()
    print(f"Loaded {len(nodes)} neurons. Starting server on ws://{HOST}:{PORT}")

    async def bound_handler(websocket):
        await handler(websocket, W, nodes)

    async with websockets.serve(bound_handler, HOST, PORT):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
