#!/usr/bin/env python3
"""
Usage: python create_clone.py <path/to/audio.wav> [--name "MyVoice"]

Creates an ElevenLabs Instant Voice Clone from an audio file and logs the
voice_id to voice_log.txt. Run delete_clone.py <voice_id> when done testing.
"""
import argparse
import sys
from pathlib import Path
import voice_manager


def main():
    parser = argparse.ArgumentParser(description="Create an ElevenLabs Instant Voice Clone")
    parser.add_argument("audio_path", help="Path to audio file (.wav, .mp3, .m4a, .webm)")
    parser.add_argument("--name", default="VoiceBank-CLI-Test", help="Name for the clone")
    args = parser.parse_args()

    audio_path = Path(args.audio_path)
    if not audio_path.exists():
        print(f"Error: file not found: {audio_path}", file=sys.stderr)
        sys.exit(1)

    print(f"Creating clone from: {audio_path.name}...")
    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    voice_id = voice_manager.create_clone(audio_bytes, audio_path.name, name=args.name)
    print(f"Created voice_id: {voice_id}")
    print(f"Logged to: voice_log.txt")
    print(f"\nIMPORTANT: Run this to delete when done:")
    print(f"  python delete_clone.py {voice_id}")


if __name__ == "__main__":
    main()
