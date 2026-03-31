"""Simulated micro:bit connected via serial/USB."""

import time
import random
from typing import Optional

from yolohome.data_models import MicrobitReading, SensorEvent
from yolohome.devices.base import MicrobitDevice


class SimulatedMicrobit(MicrobitDevice):
    """
    Generates synthetic micro:bit sensor readings.

    Scenarios:
        "idle"          — quiet, no interactions
        "button_press"  — button A at t=2s
        "shake_unlock"  — shake gesture at t=1s
        "environment"   — temperature/light ramp over 10s
    """

    SCENARIOS = {
        "idle": {},
        "button_press": {
            "trigger_time": 2.0,
            "trigger": SensorEvent.BUTTON_A,
        },
        "shake_unlock": {
            "trigger_time": 1.0,
            "trigger": SensorEvent.SHAKE,
        },
        "environment": {
            "temp_range": (15, 35),
            "light_range": (0, 255),
        },
    }

    def __init__(self, scenario: str = "idle", noise: bool = True):
        if scenario not in self.SCENARIOS:
            raise ValueError(
                f"Unknown scenario '{scenario}'. "
                f"Choose from {list(self.SCENARIOS)}"
            )
        self.scenario = scenario
        self.config = self.SCENARIOS[scenario]
        self.noise = noise
        self._base_temp = 22.0
        self._base_light = 128

    def open(self):
        pass

    def close(self):
        pass

    def read_once(self, elapsed: float = 0.0) -> MicrobitReading:
        now = time.time()
        temp = self._base_temp
        light = self._base_light
        accel = (0, 0, -1024)
        btn_a = False
        btn_b = False
        gesture = None

        if self.scenario == "button_press":
            t = self.config["trigger_time"]
            if t <= elapsed < t + 0.5:
                btn_a = True

        elif self.scenario == "shake_unlock":
            t = self.config["trigger_time"]
            if t <= elapsed < t + 0.8:
                gesture = "shake"
                accel = tuple(random.randint(-2000, 2000) for _ in range(3))

        elif self.scenario == "environment":
            t_lo, t_hi = self.config["temp_range"]
            l_lo, l_hi = self.config["light_range"]
            progress = min(elapsed / 10.0, 1.0)
            temp = t_lo + (t_hi - t_lo) * progress
            light = int(l_lo + (l_hi - l_lo) * progress)

        if self.noise:
            temp += random.gauss(0, 0.3)
            light = max(0, min(255, light + random.randint(-5, 5)))
            accel = tuple(a + random.randint(-20, 20) for a in accel)

        return MicrobitReading(
            timestamp=now,
            temperature=round(temp, 2),
            light_level=light,
            accelerometer=accel,
            button_a_pressed=btn_a,
            button_b_pressed=btn_b,
            gesture=gesture,
        )

    def stream(self, duration: float = 10.0, interval: float = 0.5):
        start = time.time()
        elapsed = 0.0
        while elapsed < duration:
            yield self.read_once(elapsed)
            time.sleep(interval)
            elapsed = time.time() - start
