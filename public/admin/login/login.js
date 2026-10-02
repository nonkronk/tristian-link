const form = document.getElementById("login-signup");
const errorBox = document.getElementById("login-error");
const button = form?.querySelector("button[type=submit]");

function error(message) {
  errorBox.textContent = message;
  errorBox.hidden = !message;
}

form?.addEventListener("submit", async (event) => {
  event.preventDefault();
  error("");
  button.disabled = true;
  const original = button.textContent;
  button.textContent = "checking…";
  try {
    const payload = Object.fromEntries(new FormData(form));
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Login failed.");
    window.location.replace("/admin/");
  } catch (err) {
    error(err.message || "Login failed.");
    document.getElementById("password")?.focus();
    document.getElementById("password")?.select();
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
});
