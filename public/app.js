const form = document.getElementById("shortener-form");
const target = document.getElementById("target");
const optionsToggle = document.getElementById("show-advanced");
const options = document.getElementById("advanced-options");
const errorBox = document.getElementById("tl-form-error");
const resultStatus = document.getElementById("tl-result-status");
const shorturl = document.getElementById("shorturl");
const subtitle = document.getElementById("tl-subtitle");
const submit = form?.querySelector(".tl-submit");
const palette = document.getElementById("tl-command-palette");
const trigger = document.getElementById("tl-command-trigger");

const editable = (el) => el && (el.matches("input, textarea, select") || el.isContentEditable);

function setBusy(busy) {
  if (!form || !submit) return;
  form.classList.toggle("is-busy", busy);
  submit.disabled = busy;
  submit.querySelector(".tl-submit-label").textContent = busy ? "Shortening…" : "Shorten ↵";
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = !message;
}

async function copyShortUrl(url, button) {
  try {
    await navigator.clipboard.writeText(url);
    if (button) {
      const old = button.textContent;
      button.textContent = "copied ✓";
      setTimeout(() => { button.textContent = old; }, 1200);
    }
  } catch {
    window.location.assign(url);
  }
}

function renderResult(data) {
  resultStatus.hidden = false;
  shorturl.className = "tl-result";
  shorturl.innerHTML = "";
  const wrapper = document.createElement("div");
  wrapper.className = "tl-result-native";
  const link = document.createElement("a");
  link.className = "link tl-result-link";
  link.href = data.url;
  link.textContent = data.link;
  link.title = "Open shortened link";
  const copy = document.createElement("button");
  copy.type = "button";
  copy.className = "tl-copy";
  copy.textContent = "copy";
  copy.addEventListener("click", () => copyShortUrl(data.url, copy));
  wrapper.append(link, copy);
  shorturl.append(wrapper);
  if (subtitle) subtitle.textContent = "tiny victory achieved.";
}

optionsToggle?.addEventListener("change", () => {
  options.classList.toggle("hidden", !optionsToggle.checked);
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError("");
  setBusy(true);
  try {
    const payload = Object.fromEntries(new FormData(form));
    const response = await fetch("/api/links", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Could not shorten that URL.");
    renderResult(data);
  } catch (error) {
    showError(error.message || "Could not shorten that URL.");
  } finally {
    setBusy(false);
  }
});

function openPalette() {
  palette.hidden = false;
  document.body.classList.add("tl-palette-open");
  palette.querySelector("button, a")?.focus();
}

function closePalette() {
  palette.hidden = true;
  document.body.classList.remove("tl-palette-open");
}

trigger?.addEventListener("click", openPalette);
palette?.addEventListener("click", (event) => {
  if (event.target === palette) closePalette();
});
palette?.querySelector("[data-tl-action='focus']")?.addEventListener("click", () => {
  closePalette();
  target?.focus();
  target?.select();
});

document.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  if ((event.metaKey || event.ctrlKey) && key === "k") {
    event.preventDefault();
    palette.hidden ? openPalette() : closePalette();
    return;
  }
  if (event.key === "Escape" && !palette.hidden) {
    event.preventDefault();
    closePalette();
    return;
  }
  if (event.key === "/" && !editable(event.target)) {
    event.preventDefault();
    target?.focus();
    target?.select();
  }
});
