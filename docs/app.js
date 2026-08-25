const LATEST_PATH = "./data/latest.json";
const HISTORY_PATH = "./data/history.json";
const CHART_WINDOW = 30;
const CHANGE_HISTORY_LIMIT = 20;

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

  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

function formatShortDate(value) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric"
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderMetrics(latest, history) {
  const packageCount = Object.keys(latest.packages).length;

  const changeCount = history.reduce(
    (total, observation) => total + observation.changes.length,
    0
  );

  document.querySelector("#package-count").textContent = packageCount;
  document.querySelector("#change-count").textContent = changeCount;
  document.querySelector("#observation-count").textContent = history.length;
  document.querySelector("#last-checked").textContent = formatDate(
    latest.checkedAt
  );
}

function renderPackages(latest) {
  const table = document.querySelector("#package-table");

  const rows = Object.entries(latest.packages)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, pkg]) => {
      return `
        <tr>
          <td class="package-name">${escapeHtml(name)}</td>
          <td>${escapeHtml(pkg.version)}</td>
          <td>${escapeHtml(pkg.node ?? "—")}</td>
          <td>${escapeHtml(formatDate(pkg.publishedAt))}</td>
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
    .reverse()
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

          <span class="change-type">
            ${escapeHtml(change.type)}
          </span>

          <span class="change-value">
            ${escapeHtml(from)}
            <span aria-hidden="true">→</span>
            ${escapeHtml(to)}
          </span>
        </article>
      `;
    })
    .join("");
}

function renderChart(history) {
  const observations = history.slice(-CHART_WINDOW);
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
          pointRadius: 2,
          pointHoverRadius: 4,
          tension: 0.25,
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
  renderPackages(latest);
  renderChangeHistory(history);
  renderChart(history);
}

initialize().catch(error => {
  console.error(error);

  const main = document.querySelector("main");

  main?.insertAdjacentHTML(
    "beforeend",
    `
      <p class="error-state">
        Dashboard data is currently unavailable.
      </p>
    `
  );
});