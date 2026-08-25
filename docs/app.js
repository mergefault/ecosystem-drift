const LATEST_PATH = "./data/latest.json";
const HISTORY_PATH = "./data/history.json";

const ACTIVITY_WINDOW = 30;
const CHANGE_HISTORY_LIMIT = 20;
const DAY_MS = 24 * 60 * 60 * 1000;

async function fetchJson(path) {
  const response = await fetch(path);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${path}: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(date);
}

function formatShortDate(value) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(date);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getChangesSince(history, timestamp) {
  return history.flatMap(observation => {
    const checkedAt = new Date(observation.checkedAt).getTime();

    if (!Number.isFinite(checkedAt) || checkedAt < timestamp) {
      return [];
    }

    return observation.changes.map(change => ({
      ...change,
      checkedAt: observation.checkedAt
    }));
  });
}

function renderMetrics(latest, history) {
  const thirtyDaysAgo = Date.now() - 30 * DAY_MS;
  const recentChanges = getChangesSince(history, thirtyDaysAgo);

  const majorReleases = recentChanges.filter(
    change => change.type === "major"
  ).length;

  const engineChanges = recentChanges.filter(
    change => change.type === "engine"
  ).length;

  document.querySelector("#package-count").textContent =
    Object.keys(latest.packages).length;

  document.querySelector("#change-count").textContent =
    recentChanges.length;

  document.querySelector("#major-count").textContent =
    majorReleases;

  document.querySelector("#engine-count").textContent =
    engineChanges;
}

function getPackageStatus(name, history) {
  const latestChange = history
    .flatMap(observation =>
      observation.changes.map(change => ({
        ...change,
        checkedAt: observation.checkedAt
      }))
    )
    .filter(change => change.package === name)
    .at(-1);

  if (!latestChange) {
    return "stable";
  }

  const age =
    Date.now() - new Date(latestChange.checkedAt).getTime();

  if (age > 30 * DAY_MS) {
    return "stable";
  }

  return latestChange.type;
}

function getNpmUrl(name) {
  return `https://www.npmjs.com/package/${encodeURIComponent(name)}`;
}

function renderPackages(latest, history) {
  const table = document.querySelector("#package-table");

  const rows = Object.entries(latest.packages)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, pkg]) => {
      const status = pkg.deprecated
        ? "deprecated"
        : getPackageStatus(name, history);

      return `
        <tr>
          <td>
            <a
              class="package-link"
              href="${escapeHtml(getNpmUrl(name))}"
              target="_blank"
              rel="noreferrer"
            >
              ${escapeHtml(name)}
            </a>
          </td>

          <td>${escapeHtml(pkg.version)}</td>

          <td class="engine-value">
            ${escapeHtml(pkg.node ?? "—")}
          </td>

          <td>${escapeHtml(formatDate(pkg.publishedAt))}</td>

          <td>
            <span class="status-badge status-${escapeHtml(status)}">
              ${escapeHtml(status)}
            </span>
          </td>
        </tr>
      `;
    });

  table.innerHTML = rows.join("");
}

function getRecentChanges(history) {
  return history
    .flatMap(observation =>
      observation.changes.map(change => ({
        ...change,
        checkedAt: observation.checkedAt
      }))
    )
    .sort(
      (left, right) =>
        new Date(right.checkedAt) - new Date(left.checkedAt)
    )
    .slice(0, CHANGE_HISTORY_LIMIT);
}

function renderChangeHistory(history) {
  const container = document.querySelector("#change-history");
  const changes = getRecentChanges(history);

  if (changes.length === 0) {
    container.innerHTML = `
      <p class="empty-state">
        No package changes detected yet.
      </p>
    `;

    return;
  }

  container.innerHTML = changes
    .map(change => {
      const from = change.from ?? "—";
      const to = change.to ?? "—";

      return `
        <article class="change-row">
          <time datetime="${escapeHtml(change.checkedAt)}">
            ${escapeHtml(formatDate(change.checkedAt))}
          </time>

          <span class="package-name">
            ${escapeHtml(change.package)}
          </span>

          <span>
            <span
              class="status-badge status-${escapeHtml(change.type)}"
            >
              ${escapeHtml(change.type)}
            </span>
          </span>

          <span class="change-value">
            ${escapeHtml(from)}
            <span class="change-arrow" aria-hidden="true">→</span>
            ${escapeHtml(to)}
          </span>
        </article>
      `;
    })
    .join("");
}

function renderChart(history) {
  const observations = history.slice(-ACTIVITY_WINDOW);
  const canvas = document.querySelector("#activity-chart");

  if (!canvas || typeof Chart === "undefined") {
    return;
  }

  new Chart(canvas, {
    type: "line",

    data: {
      labels: observations.map(observation =>
        formatShortDate(observation.checkedAt)
      ),

      datasets: [
        {
          label: "Changes",
          data: observations.map(
            observation => observation.changes.length
          ),
          borderWidth: 2,
          pointRadius: 3,
          pointHoverRadius: 5,
          tension: 0.2,
          fill: false
        }
      ]
    },

    options: {
      responsive: true,
      maintainAspectRatio: false,

      interaction: {
        intersect: false,
        mode: "index"
      },

      plugins: {
        legend: {
          display: false
        },

        tooltip: {
          displayColors: false
        }
      },

      scales: {
        x: {
          grid: {
            display: false
          },

          ticks: {
            maxTicksLimit: 6
          }
        },

        y: {
          beginAtZero: true,

          ticks: {
            precision: 0
          }
        }
      }
    }
  });
}

async function initialize() {
  const [latest, history] = await Promise.all([
    fetchJson(LATEST_PATH),
    fetchJson(HISTORY_PATH)
  ]);

  if (!latest?.packages || !Array.isArray(history)) {
    throw new Error("Dashboard data is invalid");
  }

  renderMetrics(latest, history);
  renderPackages(latest, history);
  renderChangeHistory(history);
  renderChart(history);
}

initialize().catch(error => {
  console.error(error);

  document.querySelector("main")?.insertAdjacentHTML(
    "beforeend",
    `
      <p class="error-state">
        Dashboard data is currently unavailable.
      </p>
    `
  );
});