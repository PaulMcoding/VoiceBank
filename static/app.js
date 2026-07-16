"use strict";

// ── State ───────────────────────────────────────────────────────────────────
let activeVoiceId = null;
let isPracticeMode = false;
let mediaRecorder = null;
let recordedChunks = [];
let precachePollTimer = null;

// ── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".phrase-btn").forEach(btn => {
    btn.addEventListener("click", () => speak(btn.dataset.phrase, btn));
  });
});

// ── Section switching ────────────────────────────────────────────────────────
function showSection(id) {
  ["upload-section", "cloning-section", "board-section"].forEach(s => {
    document.getElementById(s).classList.toggle("hidden", s !== id);
  });
}

// ── Upload / file handling ───────────────────────────────────────────────────
function handleFileSelect(input) {
  const file = input.files[0];
  if (file) cloneVoice(file);
}

function handleDrop(event) {
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  if (file && file.type.startsWith("audio/")) {
    cloneVoice(file);
  } else {
    showToast("Please drop an audio file", "error");
  }
  document.getElementById("drop-zone").classList.remove("drag-over");
}

document.addEventListener("DOMContentLoaded", () => {
  const dropZone = document.getElementById("drop-zone");
  dropZone.addEventListener("dragover", e => {
    e.preventDefault();
    dropZone.classList.add("drag-over");
  });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
});

// ── Voice recording ──────────────────────────────────────────────────────────
async function startRecording() {
  const btn = document.getElementById("record-btn");
  if (mediaRecorder) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordedChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || "audio/webm" });
      cloneVoice(blob);
      mediaRecorder = null;
    };
    mediaRecorder.start();
    btn.classList.add("recording");
    btn.textContent = "Recording… release to stop";
  } catch (err) {
    showToast("Microphone access denied", "error");
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state === "recording") {
    mediaRecorder.stop();
    document.getElementById("record-btn").classList.remove("recording");
    document.getElementById("record-btn").textContent = "Hold to Record";
  }
}

// ── Clone voice ──────────────────────────────────────────────────────────────
async function cloneVoice(audioFile) {
  showSection("cloning-section");
  setStatus("Sending sample to ElevenLabs…");
  updatePrecacheBar(0);

  const formData = new FormData();
  formData.append("audio", audioFile, audioFile.name || "sample.webm");

  try {
    const res = await fetch("/api/clone", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Clone failed");

    activeVoiceId = data.voice_id;
    isPracticeMode = false;
    setStatus("Voice cloned! Preparing phrases…");
    startPrecachePoll();
  } catch (err) {
    showSection("upload-section");
    showToast(err.message, "error");
  }
}

// ── Practice mode ────────────────────────────────────────────────────────────
async function startPracticeMode() {
  activeVoiceId = PRACTICE_VOICE_ID;
  isPracticeMode = true;
  document.getElementById("voice-badge").textContent = "Sample voice active";
  showSection("board-section");
  announce("Practice mode active. Tap any phrase to hear a sample voice.");
}

// ── Pre-cache polling ────────────────────────────────────────────────────────
function startPrecachePoll() {
  let attempts = 0;
  const maxAttempts = 60; // 30s timeout

  precachePollTimer = setInterval(async () => {
    attempts++;
    try {
      const res = await fetch("/api/precache_status");
      const { ready, total } = await res.json();
      updatePrecacheBar(ready, total);
      setStatus(`Preparing your voice… ${ready}/${total} phrases ready`);

      if (ready >= total || attempts >= maxAttempts) {
        clearInterval(precachePollTimer);
        showSection("board-section");
        announce("Your voice is ready. Tap any phrase to speak.");
      }
    } catch {
      // network hiccup — keep polling
    }
  }, 500);
}

function updatePrecacheBar(ready, total = TOTAL_PHRASES) {
  const pct = total > 0 ? (ready / total) * 100 : 0;
  document.getElementById("precache-fill").style.width = `${pct}%`;
  document.getElementById("precache-bar").setAttribute("aria-valuenow", ready);
  document.getElementById("precache-label").textContent =
    ready >= total ? "All phrases ready!" : `${ready} of ${total} phrases ready`;
}

function setStatus(msg) {
  document.getElementById("clone-status").textContent = msg;
}

// ── Speak ────────────────────────────────────────────────────────────────────
async function speak(text, buttonEl = null) {
  if (!activeVoiceId) {
    showToast("No active voice — upload a sample first", "error");
    return;
  }

  if (buttonEl) {
    buttonEl.classList.add("playing");
    buttonEl.setAttribute("aria-busy", "true");
  }

  try {
    const res = await fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice_id: activeVoiceId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Speak failed");

    playBase64Audio(data.audio);
    announce(`Speaking: ${text}`);
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    if (buttonEl) {
      setTimeout(() => {
        buttonEl.classList.remove("playing");
        buttonEl.removeAttribute("aria-busy");
      }, 500);
    }
  }
}

async function speakFreeText() {
  const input = document.getElementById("freetext-input");
  const text = input.value.trim();
  if (!text) return;
  const btn = document.querySelector(".btn-speak");
  btn.disabled = true;
  await speak(text);
  btn.disabled = false;
}

function playBase64Audio(b64) {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "audio/mpeg" });
  const url = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.play().catch(() => showToast("Could not play audio — check your volume", "error"));
  audio.onended = () => URL.revokeObjectURL(url);
}

// ── Delete voice ─────────────────────────────────────────────────────────────
async function deleteVoice() {
  if (!activeVoiceId || isPracticeMode) {
    activeVoiceId = null;
    isPracticeMode = false;
    showSection("upload-section");
    return;
  }

  const voiceIdToDelete = activeVoiceId;
  activeVoiceId = null;

  try {
    await fetch("/api/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice_id: voiceIdToDelete }),
    });
  } catch {
    // best-effort — don't block UI
  }

  showSection("upload-section");
  document.getElementById("voice-badge").textContent = "Your voice is active";
  showToast("Your voice clone has been deleted.");
  announce("Voice deleted. Upload a new sample to start again.");
}

// Auto-delete on page close / visibility change (belt-and-suspenders)
function sendDeleteBeacon() {
  if (!activeVoiceId || isPracticeMode) return;
  const payload = new Blob(
    [JSON.stringify({ voice_id: activeVoiceId })],
    { type: "application/json" }
  );
  navigator.sendBeacon("/api/delete", payload);
}

document.addEventListener("visibilitychange", () => {
  if (document.hidden) sendDeleteBeacon();
});
window.addEventListener("beforeunload", sendDeleteBeacon);

// ── Privacy toggle ────────────────────────────────────────────────────────────
function togglePrivacy(btn) {
  const notice = document.getElementById("privacy-notice");
  const isExpanded = btn.getAttribute("aria-expanded") === "true";
  notice.hidden = isExpanded;
  btn.setAttribute("aria-expanded", String(!isExpanded));
}

// ── Utilities ────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = "") {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.className = "toast" + (type ? " " + type : "");
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4000);
}

function announce(msg) {
  const el = document.getElementById("status-announce");
  if (el) { el.textContent = ""; setTimeout(() => { el.textContent = msg; }, 50); }
}
