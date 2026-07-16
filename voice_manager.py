import os
import json
import mimetypes
import requests
from datetime import datetime, timezone
from dotenv import load_dotenv

load_dotenv()

API_KEY = os.environ["ELEVENLABS_API_KEY"]
BASE_URL = "https://api.elevenlabs.io/v1"
LOG_FILE = os.path.join(os.path.dirname(__file__), "voice_log.txt")

FIXED_PHRASES = [
    "I'm hungry",
    "I'm thirsty",
    "I need help",
    "Call the nurse",
    "Yes",
    "No",
    "I love you",
    "I'm in pain",
]


def create_clone(audio_bytes: bytes, filename: str, name: str = "VoiceBank-session") -> str:
    resp = requests.post(
        f"{BASE_URL}/voices/add",
        headers={"xi-api-key": API_KEY},
        files=[("files", (filename, audio_bytes, _mime(filename)))],
        data={"name": name, "description": "VoiceBank AAC session clone — ephemeral"},
        timeout=30,
    )
    resp.raise_for_status()
    voice_id = resp.json()["voice_id"]
    _log("CREATE", voice_id, name=name)
    return voice_id


def delete_clone(voice_id: str) -> bool:
    resp = requests.delete(
        f"{BASE_URL}/voices/{voice_id}",
        headers={"xi-api-key": API_KEY},
        timeout=10,
    )
    success = resp.status_code == 200
    _log("DELETE", voice_id, success=success)
    return success


def text_to_speech(voice_id: str, text: str) -> bytes:
    resp = requests.post(
        f"{BASE_URL}/text-to-speech/{voice_id}",
        headers={
            "xi-api-key": API_KEY,
            "Content-Type": "application/json",
            "Accept": "audio/mpeg",
        },
        json={
            "text": text,
            "model_id": "eleven_turbo_v2",
            "voice_settings": {"stability": 0.5, "similarity_boost": 0.8},
        },
        timeout=20,
    )
    resp.raise_for_status()
    return resp.content


def list_voices() -> list:
    resp = requests.get(
        f"{BASE_URL}/voices",
        headers={"xi-api-key": API_KEY},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()["voices"]


def _mime(filename: str) -> str:
    """Return the correct MIME type for common audio formats."""
    ext = os.path.splitext(filename)[1].lower()
    return {
        ".m4a": "audio/mp4",
        ".mp3": "audio/mpeg",
        ".wav": "audio/wav",
        ".webm": "audio/webm",
        ".ogg": "audio/ogg",
        ".flac": "audio/flac",
    }.get(ext, mimetypes.guess_type(filename)[0] or "audio/mpeg")


def _log(action: str, voice_id: str, success: bool = True, name: str = ""):
    entry = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "action": action,
        "voice_id": voice_id,
        "success": success,
    }
    if name:
        entry["name"] = name
    with open(LOG_FILE, "a") as f:
        f.write(json.dumps(entry) + "\n")
