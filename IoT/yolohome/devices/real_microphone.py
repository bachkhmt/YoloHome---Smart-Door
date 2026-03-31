"""
Real microphone driver using PyAudio.

Requirements:
    pip install pyaudio

On Linux you may also need:
    sudo apt install portaudio19-dev

Usage:
    mic = RealMicrophone(sample_rate=16000)
    mic.open()
    chunk = mic.capture_chunk(chunk_ms=100)
    mic.close()
"""

import time
import logging
import numpy as np
from typing import Generator

from yolohome.data_models import AudioChunk
from yolohome.devices.base import MicrophoneDevice

logger = logging.getLogger(__name__)


class RealMicrophone(MicrophoneDevice):
    """
    Captures audio from a system microphone via PyAudio.

    Args:
        device_index: PyAudio device index (None = system default).
        sample_rate:  Samples per second (16000 is good for voice/sound
                      recognition, 44100 for high-fidelity).
        channels:     1 = mono (preferred for recognition), 2 = stereo.
    """

    def __init__(
        self,
        device_index: int = None,
        sample_rate: int = 16000,
        channels: int = 1,
    ):
        self.device_index = device_index
        self.sample_rate = sample_rate
        self.channels = channels
        self._pa = None
        self._stream = None
        self._chunk_count = 0

    def open(self):
        import pyaudio

        self._pa = pyaudio.PyAudio()
        self._stream = self._pa.open(
            format=pyaudio.paFloat32,
            channels=self.channels,
            rate=self.sample_rate,
            input=True,
            input_device_index=self.device_index,
        )

        # Log which device we're using
        if self.device_index is not None:
            info = self._pa.get_device_info_by_index(self.device_index)
            name = info.get("name", "unknown")
        else:
            info = self._pa.get_default_input_device_info()
            name = info.get("name", "system default")

        logger.info(
            f"Microphone opened: device='{name}', "
            f"rate={self.sample_rate}, channels={self.channels}"
        )

    def close(self):
        if self._stream and self._stream.is_active():
            self._stream.stop_stream()
        if self._stream:
            self._stream.close()
        if self._pa:
            self._pa.terminate()
        self._stream = None
        self._pa = None
        logger.info("Microphone closed")

    def capture_chunk(
        self, elapsed: float = 0.0, chunk_ms: float = 100
    ) -> AudioChunk:
        if self._stream is None:
            raise RuntimeError(
                "Microphone not opened. Call open() first."
            )

        num_samples = int(self.sample_rate * chunk_ms / 1000)

        # Read raw bytes and convert to float32 numpy array
        raw = self._stream.read(
            num_samples, exception_on_overflow=False
        )
        samples = np.frombuffer(raw, dtype=np.float32)

        # If stereo, take only the first channel
        if self.channels > 1:
            samples = samples[::self.channels]

        self._chunk_count += 1

        return AudioChunk(
            timestamp=time.time(),
            samples=samples,
            sample_rate=self.sample_rate,
            chunk_id=self._chunk_count,
            duration_ms=chunk_ms,
        )

    def stream(
        self, duration: float = 5.0, chunk_ms: float = 100
    ) -> Generator[AudioChunk, None, None]:
        interval = chunk_ms / 1000.0
        start = time.time()

        while (time.time() - start) < duration:
            elapsed = time.time() - start
            yield self.capture_chunk(elapsed, chunk_ms)
            # PyAudio's read() is blocking for chunk_ms already,
            # so we only add a small extra sleep to avoid busy-loop
            time.sleep(max(0, interval - 0.01))

    def __enter__(self):
        self.open()
        return self

    def __exit__(self, *args):
        self.close()

    @staticmethod
    def list_devices() -> list:
        """List all available audio input devices. Useful for debugging."""
        import pyaudio

        pa = pyaudio.PyAudio()
        devices = []
        for i in range(pa.get_device_count()):
            info = pa.get_device_info_by_index(i)
            if info.get("maxInputChannels", 0) > 0:
                devices.append({
                    "index": i,
                    "name": info["name"],
                    "sample_rate": int(info["defaultSampleRate"]),
                    "channels": info["maxInputChannels"],
                })
        pa.terminate()
        return devices
