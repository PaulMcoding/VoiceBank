https://voicebank-pexw.onrender.com

# VoiceBank

VoiceBank is a browser-based AAC (augmentative and alternative communication) board that lets someone speak common phrases — and free text — in their own cloned voice rather than a generic synthesised one. You upload a short voice sample, ElevenLabs clones it, and from that point tapping "I need help" or "I'm in pain" plays back in your own voice. It's built on the ElevenLabs Instant Voice Clone API as a hands-on way to explore what that API can do in an accessibility context. The use case it's modelled on is voice banking for people with ALS, MND, or other conditions that progressively take away the ability to speak — recording your voice while you still have it so you can keep using it later.

---

## Honest context

ElevenLabs already runs a real, clinical version of this idea. Their [Bridging Voice](https://elevenlabs.io/bridging-voice) programme works directly with ALS clinics — including partnerships with places like Boston Children's Hospital's ALS Augmentative Communication Program — to give patients free professional voice cloning, where typed text is spoken back through ElevenLabs in their own voice. That's the actual thing. This project is not that.

VoiceBank is a lightweight, open, DIY exploration of the same underlying idea — built to learn the API hands-on, understand the voice lifecycle, and see what a minimal version of the concept looks like in practice. It uses Instant Voice Clone (not Professional Voice Clone), which means lower quality and a 30-second sample rather than a long clinical recording session. It's for anyone who wants to poke around with the idea without going through a clinic, or for developers who want to see a working implementation. Don't mistake it for a replacement for the real thing.

---

## What's built

- A phrase grid of common AAC phrases (I'm hungry, I need help, Call the nurse, etc.) that play in your cloned voice
- A sentence builder tab with word-chip blocks (I / need / want / the bathroom / please / now / etc.) to construct more detailed phrases by tapping
- A free-text box for anything the fixed phrases don't cover
- In-browser voice recording (hold to record) or file upload (.wav, .mp3, .m4a, .webm)
- A "Use a sample voice" practice mode that skips cloning entirely — useful if you don't have a paid ElevenLabs account or just want to try the UI
- Auto-fallback to the sample voice if your account doesn't have Instant Voice Clone access
- Installable as a PWA — add to iPhone or Android home screen and it opens full-screen with no browser chrome
- CLI scripts for testing the voice lifecycle directly (`create_clone.py`, `delete_clone.py`)

---

## Demo

<!-- TODO: add demo GIF here -->

---

## Tech stack

| Layer | What's used |
|---|---|
| Backend | Python 3.11, Flask 3.1 |
| HTTP client | requests 2.32 |
| Frontend | Vanilla HTML/CSS/JS — no framework |
| Voice cloning | ElevenLabs Instant Voice Clone API (`POST /v1/voices/add`) |
| Text to speech | ElevenLabs TTS API (`POST /v1/text-to-speech/{voice_id}`, model: `eleven_turbo_v2`) |
| PWA | Web App Manifest + Service Worker |
| Icon generation | Pillow 11.2 |

Full dependency list: [`requirements.txt`](requirements.txt)

---

## Privacy & data

A few specific choices were made here that are worth being explicit about:

**Only Instant Voice Clone is used.** The app never touches the Professional Voice Clone endpoint. PVC locks during the verification process and cannot be deleted programmatically — IVC clones can be deleted with a single API call, which is what this app does.

**Raw audio is never saved.** When you upload or record a voice sample, it's read into memory, forwarded to ElevenLabs, and discarded. The app stores only the `voice_id` string returned by ElevenLabs, held in a server-side Flask session (signed cookie). Nothing is written to disk.

**Your clone is deleted when you're done.** There's a visible "Delete my voice" button on the board at all times. It also fires automatically when you close the tab or navigate away, using `navigator.sendBeacon` + a `visibilitychange` listener as a fallback. If the server restarts mid-session, the clone stays in your ElevenLabs account — you can delete it manually from the ElevenLabs dashboard under Voices.

**The API key is never committed.** `.env` is in `.gitignore` from the first commit. See `.env.example` for the required variables.

---

## Setup

**Requirements:** Python 3.11+, an ElevenLabs account, pip.

Instant Voice Clone requires a paid ElevenLabs plan (Starter, ~$5/month). If you're on the free tier, the app falls back to the sample voice automatically — the full UI still works.

```bash
git clone https://github.com/paulmcoding/VoiceBank.git
cd VoiceBank

pip install -r requirements.txt

cp .env.example .env
# Edit .env — add your ElevenLabs API key and a random Flask secret key

python3 generate_icons.py   # creates static/icons/ for the PWA (gitignored, run once)

python3 main.py
# Open http://localhost:5000
```

**Required `.env` variables:**

```
ELEVENLABS_API_KEY=your_key_here
FLASK_SECRET_KEY=any_random_string
```

**Optional:**

```
PRACTICE_VOICE_ID=21m00Tcm4TlvDq8ikWAM   # ElevenLabs voice ID for the sample/practice mode
```

**ElevenLabs API key permissions needed:** Text to Speech (Access) and Voices (Write).

---

## CLI voice lifecycle scripts

For testing the create → use → delete cycle directly, without running the web app:

```bash
# Clone a voice from an audio file
python3 create_clone.py your_sample.m4a

# Delete it when done (voice_id printed by the above command)
python3 delete_clone.py <voice_id>
```

Both scripts log every action to `voice_log.txt` (gitignored) with a timestamp, action, and voice_id.

---

## Limitations / what this isn't

- **Not a clinical tool.** This is a demo built to learn an API. For actual voice banking ahead of a diagnosis, look at ElevenLabs' Bridging Voice programme or speak to a speech-language pathologist.
- **Not a replacement for a real AAC device.** Dedicated AAC devices have years of refinement for motor accessibility, symbol libraries, scanning input, eye tracking, and more. This is a phrase board in a browser.
- **IVC quality is limited by your sample.** A 30-second recording in a quiet room will sound noticeably different from a long, studio-quality professional voice banking session.
- **No persistence between sessions.** Close the tab and the voice is deleted. Starting a new session means uploading and cloning again.
- **Single-user, single-server.** The in-memory phrase cache isn't shared across Flask workers. Fine for a demo; not for production.
