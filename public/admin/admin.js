const container = document.getElementById("admin-links");
const errorBox = document.getElementById("admin-error");
const refresh = document.getElementById("refresh");

function fmt(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = !message;
}

async function remove(address, row) {
  if (!window.confirm(`Delete /${address}?`)) return;
  const response = await fetch(`/admin/api/links/${encodeURIComponent(address)}`, { method: "DELETE" });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Delete failed.");
  }
  row.remove();
}

function render(links) {
  container.replaceChildren();
  if (!links.length) {
    const empty = document.createElement("p");
    empty.className = "tl-subtitle";
    empty.textContent = "No links yet.";
    container.append(empty);
    return;
  }

  for (const link of links) {
    const row = document.createElement("article");
    row.className = "tl-admin-row";

    const main = document.createElement("div");
    main.className = "tl-admin-main";
    const short = document.createElement("a");
    short.className = "tl-admin-short";
    short.href = `/${encodeURIComponent(link.address)}`;
    short.textContent = `/${link.address}`;
    const target = document.createElement("div");
    target.className = "tl-admin-target";
    target.textContent = link.target;
    main.append(short, target);

    const meta = document.createElement("div");
    meta.className = "tl-admin-meta";
    meta.textContent = `${link.visit_count} clicks · created ${fmt(link.created_at)}${link.expire_at ? ` · expires ${fmt(link.expire_at)}` : ""}${link.passworded ? " · password" : ""}`;

    const actions = document.createElement("div");
    actions.className = "tl-admin-actions";
    const del = document.createElement("button");
    del.type = "button";
    del.className = "danger";
    del.textContent = "delete";
    del.addEventListener("click", async () => {
      try {
        await remove(link.address, row);
      } catch (error) {
        showError(error.message);
      }
    });
    actions.append(del);

    row.append(main, meta, actions);
    container.append(row);
  }
}

async function load() {
  showError("");
  refresh.disabled = true;
  try {
    const response = await fetch("/admin/api/links", { headers: { accept: "application/json" } });
    if (!response.ok) throw new Error(response.status === 404 ? "Admin API is unavailable in this environment." : "Could not load links.");
    const data = await response.json();
    render(data.links || []);
  } catch (error) {
    showError(error.message);
  } finally {
    refresh.disabled = false;
  }
}

refresh.addEventListener("click", load);
load();
