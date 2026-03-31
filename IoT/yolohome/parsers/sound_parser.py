"""
Sound parser — audio event detection from microphone chunks.

In production, replace the RMS-based classification with an
MFCC + ML classifier (e.g. YAMNet, custom CNN).
"""

import time
import logging
from typing import Optional

from yolohome.data_models import AudioChunk, ParsedEvent, EventType

logger = logging.getLogger(__name__)


class SoundParser:
    """
    Consumes AudioChunk objects and emits SOUND_DETECTED events
    when the audio energy exceeds the threshold.

    Classification categories (simple heuristic):
        - "impulse"  — short, loud transient (knock)
        - "tonal"    — sustained energy (doorbell, voice)
        - "ambient"  — mild background activity
    """

    def __init__(
        self,
        rms_threshold: float = 0.05,
        cooldown: float = 0.5,
    ):
        self.rms_threshold = rms_threshold
        self.cooldown = cooldown
        self._last_event_time = 0.0

    def parse(self, chunk: AudioChunk) -> Optional[ParsedEvent]:
        """
        Analyze a single audio chunk.

        Returns:
            ParsedEvent if a notable sound is detected, else None.
        """
        now = time.time()
        if now - self._last_event_time < self.cooldown:
            return None

        if chunk.rms <= self.rms_threshold:
            return None

        sound_type = self._classify(chunk)
        self._last_event_time = now

        logger.debug(
            f"Sound detected: type={sound_type}, "
            f"rms={chunk.rms:.4f}, peak={chunk.peak:.4f}"
        )

        return ParsedEvent(
            event_type=EventType.SOUND_DETECTED,
            timestamp=chunk.timestamp,
            source="microphone",
            data={
                "chunk_id": chunk.chunk_id,
                "rms": round(chunk.rms, 4),
                "peak": round(chunk.peak, 4),
                "sound_type": sound_type,
                "duration_ms": chunk.duration_ms,
                "sample_rate": chunk.sample_rate,
            },
            confidence=min(chunk.rms * 2, 1.0),
        )

    def _classify(self, chunk: AudioChunk) -> str:
        """
        Simple heuristic classification.

        Replace with a real classifier for production:
            features = extract_mfcc(chunk.samples, chunk.sample_rate)
            label = model.predict(features)
        """
        if chunk.peak > 0.8 and chunk.rms < 0.3:
            return "impulse"
        elif chunk.rms > 0.2:
            return "tonal"
        else:
            return "ambient"
