import base64
import os
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request, session

import voice_manager

load_dotenv()

app = Flask(__name__)
app.secret_key = os.environ["FLASK_SECRET_KEY"]

PRACTICE_VOICE_ID = os.getenv("PRACTICE_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")

# In-memory phrase cache: { voice_id: { phrase: bytes } }
_cache: dict[str, dict[str, bytes]] = {}


# ── Routes ──────────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template(
        "index.html",
        phrases=voice_manager.FIXED_PHRASES,
        practice_voice_id=PRACTICE_VOICE_ID,
        has_voice="voice_id" in session,
    )


@app.route("/api/clone", methods=["POST"])
def clone():
    if "audio" not in request.files:
        return jsonify({"error": "No audio file provided"}), 400

    f = request.files["audio"]
    audio_bytes = f.read()

    if len(audio_bytes) > 10 * 1024 * 1024:
        return jsonify({"error": "File too large (max 10 MB)"}), 413

    if len(audio_bytes) < 1000:
        return jsonify({"error": "File too small — please provide a real voice sample"}), 400

    try:
        voice_id = voice_manager.create_clone(
            audio_bytes,
            f.filename or "sample.wav",
            name="VoiceBank-session",
        )
        session["voice_id"] = voice_id
        _precache_phrases(voice_id)
        return jsonify({"voice_id": voice_id, "cached": True})
    except requests.HTTPError as e:
        return jsonify({"error": f"ElevenLabs error: {e.response.status_code}"}), 502


@app.route("/api/speak", methods=["POST"])
def speak():
    data = request.get_json(silent=True) or {}
    text = data.get("text", "").strip()
    client_voice_id = data.get("voice_id", "")

    if not text or len(text) > 500:
        return jsonify({"error": "Text must be 1–500 characters"}), 400

    # Determine active voice_id: session clone or practice voice
    session_voice_id = session.get("voice_id")
    if client_voice_id == PRACTICE_VOICE_ID:
        voice_id = PRACTICE_VOICE_ID
    elif session_voice_id and client_voice_id == session_voice_id:
        voice_id = session_voice_id
    else:
        return jsonify({"error": "No active voice — please clone your voice first"}), 403

    # Cache hit for fixed phrases
    cached_audio = _cache.get(voice_id, {}).get(text)
    if cached_audio:
        return jsonify({"audio": base64.b64encode(cached_audio).decode(), "source": "cache"})

    # Live TTS for free-text
    try:
        audio_bytes = voice_manager.text_to_speech(voice_id, text)
        return jsonify({"audio": base64.b64encode(audio_bytes).decode(), "source": "live"})
    except requests.HTTPError as e:
        return jsonify({"error": f"TTS error: {e.response.status_code}"}), 502


@app.route("/api/delete", methods=["POST"])
def delete():
    # Support both JSON body and sendBeacon (which sends raw bytes)
    data = request.get_json(silent=True)
    if data is None and request.data:
        import json as _json
        try:
            data = _json.loads(request.data)
        except Exception:
            data = {}

    voice_id = session.get("voice_id")
    if not voice_id:
        return jsonify({"deleted": True})  # idempotent

    voice_manager.delete_clone(voice_id)
    _cache.pop(voice_id, None)
    session.clear()
    return jsonify({"deleted": True})


@app.route("/api/precache_status")
def precache_status():
    voice_id = session.get("voice_id")
    if not voice_id:
        return jsonify({"ready": 0, "total": len(voice_manager.FIXED_PHRASES)})
    cached = len(_cache.get(voice_id, {}))
    return jsonify({"ready": cached, "total": len(voice_manager.FIXED_PHRASES)})


# ── Internal helpers ─────────────────────────────────────────────────────────

def _precache_phrases(voice_id: str) -> None:
    """Pre-generate TTS for all fixed phrases concurrently."""
    phrases = voice_manager.FIXED_PHRASES
    _cache.setdefault(voice_id, {})

    def fetch(phrase):
        try:
            audio = voice_manager.text_to_speech(voice_id, phrase)
            return phrase, audio
        except Exception:
            return phrase, None

    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(fetch, p): p for p in phrases}
        for future in as_completed(futures):
            phrase, audio = future.result()
            if audio:
                _cache[voice_id][phrase] = audio


if __name__ == "__main__":
    app.run(debug=True, port=5000)
