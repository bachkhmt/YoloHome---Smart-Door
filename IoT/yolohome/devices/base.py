"""
Device base classes (abstract interfaces).

Both simulators and real hardware drivers inherit from these.
The InputManager only ever references these
interfaces, completely agnostic to whether they are backed
by real hardware or software simulators.
in the pipeline.
"""

from abc import ABC, abstractmethod
from typing import Optional, Generator

from yolohome.data_models import CameraFrame, AudioChunk, MicrobitReading


class CameraDevice(ABC):
    """Interface for any camera source (simulated or real)."""

    @abstractmethod
    def open(self):
        """Initialize the camera hardware / resource."""
        ...

    @abstractmethod
    def close(self):
        """Release the camera hardware / resource."""
        ...

    @abstractmethod
    def capture_once(self, elapsed: float = 0.0) -> CameraFrame:
        """Capture and return a single frame."""
        ...

    @abstractmethod
    def stream(
        self, duration: float = 10.0, fps: Optional[int] = None
    ) -> Generator[CameraFrame, None, None]:
        """Yield frames continuously for the given duration."""
        ...


class MicrophoneDevice(ABC):
    """Interface for any microphone source (simulated or real)."""

    @abstractmethod
    def open(self):
        """Initialize the audio hardware / resource."""
        ...

    @abstractmethod
    def close(self):
        """Release the audio hardware / resource."""
        ...

    @abstractmethod
    def capture_chunk(
        self, elapsed: float = 0.0, chunk_ms: float = 100
    ) -> AudioChunk:
        """Capture and return a single audio chunk."""
        ...

    @abstractmethod
    def stream(
        self, duration: float = 5.0, chunk_ms: float = 100
    ) -> Generator[AudioChunk, None, None]:
        """Yield audio chunks continuously for the given duration."""
        ...


class MicrobitDevice(ABC):
    """Interface for any micro:bit source (simulated or real)."""

    @abstractmethod
    def open(self):
        """Initialize the serial connection / resource."""
        ...

    @abstractmethod
    def close(self):
        """Release the serial connection / resource."""
        ...

    @abstractmethod
    def read_once(self, elapsed: float = 0.0) -> MicrobitReading:
        """Read and return a single sensor snapshot."""
        ...

    @abstractmethod
    def stream(
        self, duration: float = 10.0, interval: float = 0.5
    ) -> Generator[MicrobitReading, None, None]:
        """Yield sensor readings continuously for the given duration."""
        ...
