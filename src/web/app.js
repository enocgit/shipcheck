/**
 * Shipcheck page script: fetches /api/status, renders the signal hoist, PR
 * verdict cards, and the branch-hygiene panel; re-polls every 60s (PRD FR7).
 *
 * XSS containment (NFR2): every string from the snapshot — titles, authors,
 * branch names, repo, errors — enters the DOM via textContent only. No
 * innerHTML, no insertAdjacentHTML anywhere in this file.
 */

const SIGNAL_FLAGS = {
  ship: ["green", "green", "stripe green"],
  fix: ["red", "red", "stripe red"],
  wait: ["amber", "amber", "stripe amber"],
  unknown: ["grey", "grey", "stripe grey"],
};
const SIGNAL_WORDS = {
  ship: "ship",
  fix: "needs fixes",
  wait: "wait",
  unknown: "incomplete",
};

const REASON_LABELS = {
  mergeable: "mergeable",
  conflicting: "merge conflict",
  "mergeability-pending": "mergeability pending",
  "checks-passing": "checks green",
  "checks-failing": "checks failing",
  "checks-pending": "checks pending",
  "no-checks": "no checks configured",
  approved: "approved",
  "changes-requested": "changes requested",
  "missing-review": "awaiting review",
  draft: "draft",
  "stale-behind-base": "behind base",
  "stale-idle": "idle over 7 days",
  fresh: "fresh",
};

const VERDICT_LABELS = { ship: "ship", fix: "fix", wait: "wait" };

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function reasonLabel(code) {
  const known = REASON_LABELS[code];
  // Unknown codes degrade visibly as their own kind of reason, never silently.
  return known ?? `unrecognized reason (${code})`;
}

function age(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function renderHoist(signal) {
  const hoist = document.getElementById("hoist");
  hoist.replaceChildren();
  for (const spec of SIGNAL_FLAGS[signal] ?? SIGNAL_FLAGS.unknown) {
    const [shape, color] = spec.split(" ");
    const flag = el("div", `flag ${shape}`);
    if (shape !== "solid" && color) flag.style.color = `var(--${color})`;
    hoist.append(flag);
  }
}

function renderSignal(signal) {
  renderHoist(signal);
  const word = document.getElementById("signal");
  word.textContent = SIGNAL_WORDS[signal] ?? signal;
  word.className = `signal-word ${signal}`;
}

function renderPrs(section) {
  const container = document.getElementById("prs");
  container.replaceChildren();
    if (!section.ok) {
    container.append(el("p", "section-error", `PR data unavailable: ${section.error}`));
    return;
  }
  if (section.data.length === 0) {
    container.append(el("p", "section-error", "No open pull requests."));
    return;
  }
  for (const pr of section.data) {
    const card = el("article", pr.verdict);
    const head = el("div", "card-head");
    head.append(el("span", "verdict", VERDICT_LABELS[pr.verdict] ?? pr.verdict));
    const label = `#${pr.number} ${pr.title}`;
    // Defense in depth: the contract already constrains URLs; never assign a
    // non-GitHub href regardless of what the payload claimed.
    if (/^https:\/\/github\.com\//.test(pr.url)) {
      const title = el("span", "pr-title");
      const link = el("a", undefined, label);
      link.href = pr.url;
      title.append(link);
      head.append(title);
    } else {
      head.append(el("span", "pr-title", label));
      head.append(el("span", "section-error", "(link withheld: unexpected URL)"));
    }
    card.append(head);
    const reasons = el("ul", "reasons");
    for (const code of pr.reasons) reasons.append(el("li", undefined, reasonLabel(code)));
    card.append(reasons);
    container.append(card);
  }
}

function renderBranches(section) {
  const container = document.getElementById("branches");
  container.replaceChildren();
  if (!section.ok) {
    container.append(el("p", "section-error", `Branch data unavailable: ${section.error}`));
    return;
  }
  if (section.data.length === 0) {
    container.append(el("p", "section-error", "No non-default branches."));
    return;
  }
  const table = el("table");
  const headRow = el("tr");
  for (const label of ["Branch", "Ahead", "Behind", "Last commit", "Stale"]) {
    headRow.append(el("th", undefined, label));
  }
  table.append(headRow);
  for (const branch of section.data) {
    const row = el("tr");
    row.append(el("td", undefined, branch.name));
    row.append(el("td", "num", String(branch.ahead)));
    row.append(el("td", "num", String(branch.behind)));
    row.append(el("td", undefined, age(branch.lastCommitAt)));
    const stale = el("td", branch.stale ? "stale-yes" : "stale-no");
    // Wording derives from the same facts the verdict engine used.
    stale.textContent = branch.stale
      ? branch.behind > 0
        ? "behind default"
        : "idle 30+ days"
      : "no";
    row.append(stale);
    table.append(row);
  }
  container.append(table);
}

function render(body) {
  const banner = document.getElementById("banner");
  banner.replaceChildren();
  if (!body.ok) {
    banner.append(
      el("div", "banner"),
    );
    banner.firstChild.append(
      el("div", undefined, "Ship data is unavailable right now."),
      el("div", "why", body.error),
    );
    document.getElementById("repo").textContent = "";
    document.getElementById("meta").textContent = "";
    renderSignal("unknown");
    document.getElementById("prs").replaceChildren();
    document.getElementById("branches").replaceChildren();
    return;
  }
  document.getElementById("repo").textContent = body.repo;
  const when = age(body.generatedAt);
  const partial = !body.prs.ok || !body.branches.ok;
  document.getElementById("meta").textContent = partial
    ? `data partially unavailable · refreshed ${when}`
    : `refreshed ${when} · updates every 60s`;
  renderSignal(body.shipSignal);
  renderPrs(body.prs);
  renderBranches(body.branches);
}

async function refresh() {
  try {
    const response = await fetch("/api/status");
    render(await response.json());
  } catch {
    render({ ok: false, error: "The server did not respond. Is shipcheck still running?" });
  }
}

refresh();
setInterval(refresh, 60_000);
