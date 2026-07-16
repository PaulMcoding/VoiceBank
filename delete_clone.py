#!/usr/bin/env python3
"""
Usage: python delete_clone.py <voice_id>

Deletes an ElevenLabs voice clone and logs the deletion to voice_log.txt.
"""
import sys
import voice_manager


def main():
    if len(sys.argv) != 2:
        print("Usage: python delete_clone.py <voice_id>", file=sys.stderr)
        sys.exit(1)

    voice_id = sys.argv[1].strip()
    print(f"Deleting voice_id: {voice_id}...")
    success = voice_manager.delete_clone(voice_id)

    if success:
        print(f"Deleted voice_id: {voice_id}")
        print("Logged to: voice_log.txt")
    else:
        print(f"Voice {voice_id} not found or already deleted (still logged).")


if __name__ == "__main__":
    main()
