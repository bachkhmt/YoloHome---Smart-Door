"""Simulated microphone for sound recognition testing."""

import time
import numpy as np
from typing import Optional

from yolohome.data_models import AudioChunk
from yolohome.devices.base import MicrophoneDevice


class SimulatedMicrophone(MicrophoneDevice):
    """
    Generates synthetic audio chunks.

    Scenarios:
        "silence"   — ambient noise only
        "doorbell"  — 880Hz tone at t=1s
        "knock"     — three impulses at t=0.5, 0.7, 0.9s
        "voice"     — speech-like harmonics at t=1s
        "mixed"     — doorbell then voice
    """

    SCENARIOS = {
        "silence": {"events": []},
        "doorbell": {
            "events": [
                {"type": "tone", "freq": 880,
                 "start": 1.0, "duration": 0.6, "amplitude": 0.7},
            ]
        },
        "knock": {
            "events": [
                {"type": "impulse", "start": 0.5,
                 "duration": 0.05, "amplitude": 0.9},
                {"type": "impulse", "start": 0.7,
                 "duration": 0.05, "amplitude": 0.85},
                {"type": "impulse", "start": 0.9,
                 "duration": 0.05, "amplitude": 0.8},
            ]
        },
        "voice": {
            "events": [
                {"type": "voice", "start": 1.0,
                 "duration": 2.0, "amplitude": 0.5},
            ]
        },
        "mixed": {
            "events": [
                {"type": "tone", "freq": 880,
                 "start": 0.5, "duration": 0.6, "amplitude": 0.7},
                {"type": "voice", "start": 2.0,
                 "duration": 1.5, "amplitude": 0.5},
            ]
        },
    }

    def __init__(self, scenario: str = "silence", sample_rate: int = 16000):
        if scenario not in self.SCENARIOS:
            raise ValueError(
                f"Unknown scenario '{scenario}'. "
                f"Choose from {list(self.SCENARIOS)}"
            )
        self.scenario = scenario
        self.sample_rate = sample_rate
        self.config = self.SCENARIOS[scenario]
        self._chunk_count = 0
        self._noise_floor = 0.005

    def open(self):
        pass

    def close(self):
        pass

    def _generate_samples(
        self, start_time: float, num_samples: int
    ) -> np.ndarray:
        t = np.linspace(
            start_time,
            start_time + num_samples / self.sample_rate,
            num_samples,
            endpoint=False,
            dtype=np.float32,
        )
        signal = (
            np.random.randn(num_samples).astype(np.float32) * self._noise_floor
        )

        for event in self.config.get("events", []):
            ev_start = event["start"]
            ev_end = ev_start + event["duration"]
            mask = (t >= ev_start) & (t < ev_end)
            if not np.any(mask):
                continue

            amp = event["amplitude"]
            ev_type = event["type"]

            if ev_type == "tone":
                freq = event.get("freq", 880)
                signal[mask] += (
                    amp * np.sin(2 * np.pi * freq * t[mask])
                ).astype(np.float32)

            elif ev_type == "impulse":
                local_t = t[mask] - ev_start
                decay = np.exp(-local_t * 60).astype(np.float32)
                signal[mask] += (
                    amp * decay
                    * np.random.randn(mask.sum()).astype(np.float32)
                )

            elif ev_type == "voice":
                f0 = 150
                for h in [1, 2, 3, 5]:
                    signal[mask] += (
                        (amp / h) * np.sin(2 * np.pi * f0 * h * t[mask])
                    ).astype(np.float32)
                mod = (
                    0.5 + 0.5 * np.sin(2 * np.pi * 4 * t[mask])
                ).astype(np.float32)
                signal[mask] *= mod

        return np.clip(signal, -1.0, 1.0)

    def capture_chunk(
        self, elapsed: float, chunk_ms: float = 100
    ) -> AudioChunk:
        num_samples = int(self.sample_rate * chunk_ms / 1000)
        samples = self._generate_samples(elapsed, num_samples)
        self._chunk_count += 1
        return AudioChunk(
            timestamp=time.time(),
            samples=samples,
            sample_rate=self.sample_rate,
            chunk_id=self._chunk_count,
            duration_ms=chunk_ms,
        )

    def stream(self, duration: float = 5.0, chunk_ms: float = 100):
        interval = chunk_ms / 1000.0
        start = time.time()
        elapsed = 0.0
        while elapsed < duration:
            yield self.capture_chunk(elapsed, chunk_ms)
            time.sleep(interval)
            elapsed = time.time() - start
