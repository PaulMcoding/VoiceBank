"use strict";

// ── State ─────────────────────────────────────────────────────────────────────
let activeVoiceId     = null;
let isPracticeMode    = false;
let mediaRecorder     = null;
let recordedChunks    = [];
let precachePollTimer = null;
let isRecording       = false;
let lastSpokenText    = null;

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll(".phrase-btn").forEach(btn => {
    btn.addEventListener("click", () => speak(btn.dataset.phrase, btn));
  });
  initRecordButton();
  initDropZone();
  initWordBuilder();
});

// ── Screen switching ──────────────────────────────────────────────────────────
function showScreen(id) {
  ["setup-screen", "cloning-screen", "board-screen"].forEach(s => {
    document.getElementById(s).classList.toggle("hidden", s !== id);
  });

  // Move focus to the screen's main heading for screen readers
  const focusTargets = {
    "setup-screen":   "setup-heading",
    "cloning-screen": "cloning-heading",
  };
  const target = focusTargets[id];
  if (target) {
    const el = document.getElementById(target);
    if (el) el.focus();
  }
}

// ── Drop zone ─────────────────────────────────────────────────────────────────
function initDropZone() {
  const zone = document.getElementById("drop-zone");
  zone.addEventListener("dragover", e => { e.preventDefault(); zone.classList.add("drag-over"); });
  zone.addEventListener("dragleave", ()  => zone.classList.remove("drag-over"));
}

function handleFileSelect(input) {
  const file = input.files[0];
  if (file) cloneVoice(file);
}

function handleDrop(event) {
  event.preventDefault();
  document.getElementById("drop-zone").classList.remove("drag-over");
  const file = event.dataTransfer.files[0];
  if (file && file.type.startsWith("audio/")) {
    cloneVoice(file);
  } else {
    showToast("Please drop an audio file (.wav, .mp3, .m4a, .webm)", "error");
  }
}

// ── Recording — toggle for all input methods ──────────────────────────────────
function initRecordButton() {
  const btn = document.getElementById("record-btn");

  // Pointing device: hold to record
  btn.addEventListener("pointerdown", e => {
    if (e.pointerType === "mouse" || e.pointerType === "touch") {
      e.preventDefault();
      startRecording();
    }
  });
  ["pointerup", "pointerleave", "pointercancel"].forEach(ev => {
    btn.addEventListener(ev, e => {
      if ((e.pointerType === "mouse" || e.pointerType === "touch") && isRecording) {
        stopRecording();
      }
    });
  });

  // Keyboard: Enter / Space → toggle (pointerType is "" for keyboard clicks)
  btn.addEventListener("click", e => {
    if (e.pointerType === "") {
      isRecording ? stopRecording() : startRecording();
    }
  });
}

async function startRecording() {
  if (isRecording) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recordedChunks = [];
    mediaRecorder   = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = e => { if (e.data.size > 0) recordedChunks.push(e.data); };
    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(recordedChunks, { type: mediaRecorder.mimeType || "audio/webm" });
      mediaRecorder = null;
      cloneVoice(blob);
    };
    mediaRecorder.start();
    isRecording = true;
    const btn = document.getElementById("record-btn");
    btn.setAttribute("aria-pressed", "true");
    document.getElementById("record-label").textContent = "Recording… press to stop";
    announce("Recording started. Press the button again to stop.");
  } catch {
    showToast("Microphone access denied — check your browser permissions", "error");
  }
}

function stopRecording() {
  if (!isRecording || !mediaRecorder) return;
  mediaRecorder.stop();
  isRecording = false;
  const btn = document.getElementById("record-btn");
  btn.setAttribute("aria-pressed", "false");
  document.getElementById("record-label").textContent = "Record Voice Sample";
  announce("Recording stopped. Processing your voice sample.");
}

// ── Clone voice ───────────────────────────────────────────────────────────────
async function cloneVoice(audioFile) {
  showScreen("cloning-screen");
  setCloneStatus("Sending sample to ElevenLabs…");
  updatePrecacheBar(0);

  const formData = new FormData();
  formData.append("audio", audioFile, audioFile.name || "sample.webm");

  try {
    const res  = await fetch("/api/clone", { method: "POST", body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Setup failed");

    activeVoiceId  = data.voice_id;
    isPracticeMode = data.mode === "practice";

    const badge = document.getElementById("voice-badge");
    badge.textContent = isPracticeMode ? "Sample voice" : "Your voice";
    if (isPracticeMode) showToast(data.notice || "Using a sample voice.");

    setCloneStatus(isPracticeMode ? "Preparing sample voice…" : "Voice cloned! Preparing phrases…");
    startPrecachePoll();
  } catch (err) {
    showScreen("setup-screen");
    showToast(err.message, "error");
  }
}

// ── Practice mode ─────────────────────────────────────────────────────────────
function startPracticeMode() {
  activeVoiceId  = PRACTICE_VOICE_ID;
  isPracticeMode = true;
  document.getElementById("voice-badge").textContent = "Sample voice";
  showScreen("board-screen");
  announce("Practice mode. Tap any phrase to hear a sample voice.");
}

// ── Pre-cache polling ─────────────────────────────────────────────────────────
function startPrecachePoll() {
  let attempts = 0;
  precachePollTimer = setInterval(async () => {
    attempts++;
    try {
      const res = await fetch("/api/precache_status");
      const { ready, total } = await res.json();
      updatePrecacheBar(ready, total);
      setCloneStatus(`Preparing your voice… ${ready} of ${total} phrases ready`);
      if (ready >= total || attempts >= 60) {
        clearInterval(precachePollTimer);
        showScreen("board-screen");
        announce("Your voice is ready. Tap any phrase to speak.");
      }
    } catch { /* keep polling */ }
  }, 500);
}

function updatePrecacheBar(ready, total = TOTAL_PHRASES) {
  const pct = total > 0 ? (ready / total) * 100 : 0;
  document.getElementById("precache-fill").style.width = `${pct}%`;
  document.getElementById("precache-bar").setAttribute("aria-valuenow", ready);
  document.getElementById("precache-label").textContent =
    ready >= total ? "Ready!" : `${ready} of ${total} phrases ready`;
}

function setCloneStatus(msg) {
  document.getElementById("clone-status").textContent = msg;
}

// ── Speak ─────────────────────────────────────────────────────────────────────
async function speak(text, buttonEl = null) {
  if (!activeVoiceId) {
    showToast("No active voice — set up your voice first", "error");
    return;
  }

  if (buttonEl) {
    buttonEl.classList.add("playing");
    buttonEl.setAttribute("aria-busy", "true");
  }

  try {
    const res  = await fetch("/api/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice_id: activeVoiceId }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Speak failed");

    playBase64Audio(data.audio);
    lastSpokenText = text;
    updateOutputBar(text);
    announce(`Speaking: ${text}`);
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    if (buttonEl) {
      setTimeout(() => {
        buttonEl.classList.remove("playing");
        buttonEl.removeAttribute("aria-busy");
      }, 600);
    }
  }
}

async function speakFreeText() {
  const input = document.getElementById("freetext-input");
  const text  = input.value.trim();
  if (!text) return;
  const btn = document.querySelector(".type-speak-btn");
  btn.disabled = true;
  await speak(text);
  btn.disabled = false;
}

function replayLast() {
  if (lastSpokenText) speak(lastSpokenText);
}

function playBase64Audio(b64) {
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const blob  = new Blob([bytes], { type: "audio/mpeg" });
  const url   = URL.createObjectURL(blob);
  const audio = new Audio(url);
  audio.play().catch(() => showToast("Could not play audio — check your volume", "error"));
  audio.onended = () => URL.revokeObjectURL(url);
}

// ── Output bar ────────────────────────────────────────────────────────────────
function updateOutputBar(text) {
  const el          = document.getElementById("output-text");
  const placeholder = document.getElementById("output-placeholder");
  const replayBtn   = document.getElementById("output-replay");

  if (placeholder) placeholder.remove();
  el.textContent = text;
  replayBtn.disabled = false;
}

// ── Delete / end session ──────────────────────────────────────────────────────
async function deleteVoice() {
  if (!activeVoiceId || isPracticeMode) {
    activeVoiceId  = null;
    isPracticeMode = false;
    lastSpokenText = null;
    showScreen("setup-screen");
    return;
  }

  const id = activeVoiceId;
  activeVoiceId  = null;
  lastSpokenText = null;

  try {
    await fetch("/api/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ voice_id: id }),
    });
  } catch { /* best-effort */ }

  showScreen("setup-screen");
  showToast("Session ended — your voice clone has been deleted.");
  announce("Session ended. Voice clone deleted.");
}

function sendDeleteBeacon() {
  if (!activeVoiceId || isPracticeMode) return;
  navigator.sendBeacon(
    "/api/delete",
    new Blob([JSON.stringify({ voice_id: activeVoiceId })], { type: "application/json" })
  );
}
document.addEventListener("visibilitychange", () => { if (document.hidden) sendDeleteBeacon(); });
window.addEventListener("beforeunload", sendDeleteBeacon);

// ── Word builder ──────────────────────────────────────────────────────────────
const WORD_BANK = {
  "I / Me":     ["I", "me", "my", "we", "you"],
  "Verbs":      ["need", "want", "feel", "am", "have", "can't", "can't feel", "can't move", "can't breathe", "would like", "don't want"],
  "Body":       ["my legs", "my arms", "my hands", "my feet", "my back", "my chest", "my stomach", "my head", "my neck", "my shoulder", "my hip", "my knee", "my throat", "my mouth", "my face"],
  "States":     ["hungry", "thirsty", "tired", "cold", "hot", "sick", "in pain", "numb", "weak", "stiff", "burning", "swollen", "scared", "okay", "better", "worse", "happy", "sad", "confused"],
  "Nouns":      ["help", "water", "food", "medicine", "the bathroom", "my phone", "a nurse", "a doctor", "my family", "a blanket", "more time"],
  "Modifiers":  ["please", "now", "very", "more", "not", "a little", "a lot", "right now", "soon"],
};

let builtWords = [];

function initWordBuilder() {
  const container = document.getElementById("word-bank");
  if (!container) return;
  Object.entries(WORD_BANK).forEach(([category, words]) => {
    const group = document.createElement("div");
    group.className = "word-group";

    const label = document.createElement("span");
    label.className = "word-group-label";
    label.textContent = category;
    label.setAttribute("aria-hidden", "true");
    group.appendChild(label);

    const row = document.createElement("div");
    row.className = "word-row";
    words.forEach(word => {
      const btn = document.createElement("button");
      btn.className   = "word-chip";
      btn.textContent = word;
      btn.setAttribute("aria-label", `Add "${word}"`);
      btn.addEventListener("click", () => addWord(word));
      row.appendChild(btn);
    });
    group.appendChild(row);
    container.appendChild(group);
  });
}

function addWord(word) {
  builtWords.push(word);
  renderBuilt();
}

function removeLastWord() {
  if (!builtWords.length) return;
  const removed = builtWords.pop();
  renderBuilt();
  announce(`Removed "${removed}". Sentence: ${builtWords.join(" ") || "empty"}`);
}

function clearBuiltSentence() {
  builtWords = [];
  renderBuilt();
  announce("Sentence cleared.");
}

function renderBuilt() {
  const text     = builtWords.join(" ");
  const speakBtn = document.getElementById("speak-built-btn");

  // Mirror into the output bar so the user can see what they're building
  const outputEl = document.getElementById("output-text");
  const ph       = document.getElementById("output-placeholder");
  if (text) {
    if (ph) ph.remove();
    outputEl.textContent = text;
    document.getElementById("output-replay").disabled = true; // building, not finalized
  } else if (!lastSpokenText) {
    outputEl.innerHTML = '<span class="output-placeholder" id="output-placeholder">Tap a phrase to speak</span>';
  }

  speakBtn.disabled = !text;
  speakBtn.setAttribute("aria-label", text ? `Speak: ${text}` : "Speak sentence");
}

function speakBuiltSentence() {
  const text = builtWords.join(" ");
  if (text) speak(text);
}

// ── Board tabs ────────────────────────────────────────────────────────────────
function switchTab(tab) {
  ["phrases", "builder", "type"].forEach(t => {
    const isActive = t === tab;
    document.getElementById(`tab-${t}`).setAttribute("aria-selected", String(isActive));
    document.getElementById(`tab-${t}`).classList.toggle("active", isActive);
    document.getElementById(`panel-${t}`).classList.toggle("hidden", !isActive);
  });
}

// ── Privacy toggle ────────────────────────────────────────────────────────────
function togglePrivacy(btn) {
  const notice     = document.getElementById("privacy-notice");
  const isExpanded = btn.getAttribute("aria-expanded") === "true";
  notice.hidden    = isExpanded;
  btn.setAttribute("aria-expanded", String(!isExpanded));
}

// ── Utilities ─────────────────────────────────────────────────────────────────
let toastTimer = null;
function showToast(msg, type = "") {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.className   = "toast" + (type ? " " + type : "");
  toast.hidden      = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 4500);
}

function announce(msg) {
  const el = document.getElementById("status-announce");
  if (!el) return;
  el.textContent = "";
  setTimeout(() => { el.textContent = msg; }, 50);
}
