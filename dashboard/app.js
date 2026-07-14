const STATUS_OPTIONS = ["Новый", "В работе", "Запрос цены", "Готовим заявку", "Подано", "Отказ"];
const STATUS_STORAGE_KEY = "prs-tender-manager-status-v1";

const state = {
  data: null,
  tenders: [],
  selectedId: null,
  filters: {
    query: "",
    className: "all",
    country: "all",
    status: "all",
  },
  statuses: loadStatuses(),
};

const els = {
  updatedAt: document.getElementById("updatedAt"),
  metricTotal: document.getElementById("metricTotal"),
  metricNew: document.getElementById("metricNew"),
  metricA: document.getElementById("metricA"),
  metricUrgent: document.getElementById("metricUrgent"),
  metricValue: document.getElementById("metricValue"),
  actionCount: document.getElementById("actionCount"),
  actionList: document.getElementById("actionList"),
  searchInput: document.getElementById("searchInput"),
  countryFilter: document.getElementById("countryFilter"),
  statusFilter: document.getElementById("statusFilter"),
  resetFilters: document.getElementById("resetFilters"),
  resultCount: document.getElementById("resultCount"),
  rows: document.getElementById("tenderRows"),
  emptyState: document.getElementById("emptyState"),
  detailPane: document.getElementById("detailPane"),
  detailEmpty: document.getElementById("detailEmpty"),
  detailContent: document.getElementById("detailContent"),
  detailClass: document.getElementById("detailClass"),
  detailTitle: document.getElementById("detailTitle"),
  detailCustomer: document.getElementById("detailCustomer"),
  detailFacts: document.getElementById("detailFacts"),
  detailRelevance: document.getElementById("detailRelevance"),
  detailStrategy: document.getElementById("detailStrategy"),
  detailRisks: document.getElementById("detailRisks"),
  detailAction: document.getElementById("detailAction"),
  detailActionDue: document.getElementById("detailActionDue"),
  detailStatus: document.getElementById("detailStatus"),
  detailLink: document.getElementById("detailLink"),
  closeDetail: document.getElementById("closeDetail"),
  copySummary: document.getElementById("copySummary"),
  toast: document.getElementById("toast"),
};

start();

async function start() {
  try {
    const response = await fetch("./data/tenders.json", { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json();
    state.tenders = state.data.tenders.map((tender) => ({
      ...tender,
      managerStatus: state.statuses[tender.id] || tender.managerStatus || "Новый",
    }));
    setupFilters();
    bindEvents();
    renderAll();
  } catch (error) {
    console.error(error);
    els.rows.innerHTML = `<tr><td colspan="7">Не удалось загрузить данные тендеров.</td></tr>`;
  }
}

function setupFilters() {
  const countries = [...new Set(state.tenders.map((tender) => tender.country))].sort((a, b) => a.localeCompare(b, "ru"));
  countries.forEach((country) => {
    const option = document.createElement("option");
    option.value = country;
    option.textContent = country;
    els.countryFilter.append(option);
  });
}

function bindEvents() {
  els.searchInput.addEventListener("input", (event) => {
    state.filters.query = event.target.value.trim().toLocaleLowerCase("ru");
    renderTable();
  });

  document.querySelectorAll("[data-class]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-class]").forEach((item) => item.classList.remove("is-active"));
      button.classList.add("is-active");
      state.filters.className = button.dataset.class;
      renderTable();
    });
  });

  els.countryFilter.addEventListener("change", (event) => {
    state.filters.country = event.target.value;
    renderTable();
  });

  els.statusFilter.addEventListener("change", (event) => {
    state.filters.status = event.target.value;
    renderTable();
  });

  els.resetFilters.addEventListener("click", resetFilters);
  els.closeDetail.addEventListener("click", clearDetail);
  els.detailStatus.addEventListener("change", (event) => {
    if (state.selectedId) updateStatus(state.selectedId, event.target.value);
  });
  els.copySummary.addEventListener("click", copySummary);
}

function renderAll() {
  renderMetrics();
  renderActions();
  renderTable();
  els.updatedAt.textContent = `Обновлено ${formatDateTime(state.data.generatedAt)}`;
  if (window.lucide) window.lucide.createIcons();
}

function renderMetrics() {
  const active = state.tenders.filter((tender) => tender.managerStatus !== "Отказ");
  const urgent = active.filter((tender) => hoursUntil(tender.deadline) <= 48 && hoursUntil(tender.deadline) > 0);
  const rubValue = active
    .filter((tender) => tender.currency === "RUB" && Number.isFinite(tender.amount))
    .reduce((sum, tender) => sum + tender.amount, 0);

  els.metricTotal.textContent = active.length;
  els.metricNew.textContent = `${active.filter((tender) => tender.isNew).length} новых`;
  els.metricA.textContent = active.filter((tender) => tender.class === "A").length;
  els.metricUrgent.textContent = urgent.length;
  els.metricValue.textContent = compactMoney(rubValue, "RUB");
}

function renderActions() {
  const actions = state.tenders
    .filter((tender) => tender.managerStatus !== "Отказ" && tender.managerStatus !== "Подано")
    .sort((a, b) => new Date(a.nextActionDue) - new Date(b.nextActionDue) || b.score - a.score)
    .slice(0, 4);

  els.actionCount.textContent = `${actions.length} в очереди`;
  els.actionList.innerHTML = "";

  actions.forEach((tender) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "action-item";
    item.innerHTML = `
      <div class="action-meta">
        <span class="class-badge class-${tender.class}">${tender.class}</span>
        <span>${formatShortDateTime(tender.nextActionDue)}</span>
      </div>
      <strong>${escapeHtml(tender.customer)}</strong>
      <span>${escapeHtml(tender.nextAction)}</span>
    `;
    item.addEventListener("click", () => selectTender(tender.id));
    els.actionList.append(item);
  });
}

function renderTable() {
  const filtered = getFilteredTenders();
  els.resultCount.textContent = `Показано ${filtered.length} из ${state.tenders.length}`;
  els.rows.innerHTML = "";
  els.emptyState.hidden = filtered.length !== 0;

  filtered.forEach((tender) => {
    const row = document.createElement("tr");
    row.dataset.id = tender.id;
    row.classList.toggle("is-selected", tender.id === state.selectedId);
    const urgent = hoursUntil(tender.deadline) <= 48;
    row.innerHTML = `
      <td data-label="Класс">
        <div class="class-cell">
          <span class="class-badge class-${tender.class}">${tender.class}</span>
          <span class="score">${tender.score}</span>
        </div>
      </td>
      <td data-label="Закупка">
        <div class="tender-title">${escapeHtml(tender.title)}</div>
        <div class="subline">${escapeHtml(tender.direction)} · № ${escapeHtml(tender.number)}</div>
      </td>
      <td data-label="Заказчик"><div class="customer-cell">${escapeHtml(tender.customer)}</div></td>
      <td data-label="Сумма">${formatAmountCell(tender)}</td>
      <td data-label="Дедлайн">
        <div class="deadline-value ${urgent ? "deadline-urgent" : ""}">${formatShortDateTime(tender.deadline)}</div>
        <div class="deadline-note">${formatRemaining(tender.deadline)}</div>
      </td>
      <td data-label="Решение"><span class="decision-badge ${decisionClass(tender.decision)}">${escapeHtml(tender.decision)}</span></td>
      <td data-label="Статус">
        <select class="row-status" aria-label="Статус ${escapeHtml(tender.title)}">
          ${STATUS_OPTIONS.map((status) => `<option ${status === tender.managerStatus ? "selected" : ""}>${status}</option>`).join("")}
        </select>
      </td>
    `;
    row.addEventListener("click", () => selectTender(tender.id));
    row.querySelector("select").addEventListener("click", (event) => event.stopPropagation());
    row.querySelector("select").addEventListener("change", (event) => {
      event.stopPropagation();
      updateStatus(tender.id, event.target.value);
    });
    els.rows.append(row);
  });
}

function getFilteredTenders() {
  return state.tenders
    .filter((tender) => {
      const haystack = [tender.title, tender.customer, tender.number, tender.direction, tender.country, tender.region]
        .join(" ")
        .toLocaleLowerCase("ru");
      return (!state.filters.query || haystack.includes(state.filters.query))
        && (state.filters.className === "all" || tender.class === state.filters.className)
        && (state.filters.country === "all" || tender.country === state.filters.country)
        && (state.filters.status === "all" || tender.managerStatus === state.filters.status);
    })
    .sort((a, b) => classRank(a.class) - classRank(b.class) || b.score - a.score || new Date(a.deadline) - new Date(b.deadline));
}

function selectTender(id) {
  const tender = state.tenders.find((item) => item.id === id);
  if (!tender) return;
  state.selectedId = id;
  els.detailPane.classList.add("is-open");
  document.body.classList.add("detail-open");
  els.detailEmpty.hidden = true;
  els.detailContent.hidden = false;
  els.detailClass.innerHTML = `<span class="class-badge class-${tender.class}">${tender.class}</span> <span class="score">${tender.score}/100</span>`;
  els.detailTitle.textContent = tender.title;
  els.detailCustomer.textContent = tender.customer;
  els.detailFacts.innerHTML = `
    <dt>Решение</dt><dd>${escapeHtml(tender.decision)}</dd>
    <dt>Закупка</dt><dd>№ ${escapeHtml(tender.number)} · ${escapeHtml(tender.law)}</dd>
    <dt>Регион</dt><dd>${escapeHtml(tender.country)}, ${escapeHtml(tender.region)}</dd>
    <dt>Сумма</dt><dd>${formatAmount(tender)}</dd>
    <dt>Дедлайн</dt><dd>${formatDateTime(tender.deadline)} · ${formatRemaining(tender.deadline)}</dd>
  `;
  els.detailRelevance.textContent = tender.relevance;
  els.detailStrategy.textContent = tender.strategy;
  els.detailRisks.textContent = tender.risks;
  els.detailAction.textContent = tender.nextAction;
  els.detailActionDue.textContent = `Сделать до ${formatDateTime(tender.nextActionDue)}`;
  els.detailStatus.value = tender.managerStatus;
  els.detailLink.href = tender.url;
  renderTable();
  if (window.lucide) window.lucide.createIcons();
  if (window.innerWidth > 720 && window.innerWidth <= 980) {
    els.detailContent.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function clearDetail() {
  state.selectedId = null;
  els.detailPane.classList.remove("is-open");
  document.body.classList.remove("detail-open");
  els.detailEmpty.hidden = false;
  els.detailContent.hidden = true;
  renderTable();
}

function updateStatus(id, status) {
  const tender = state.tenders.find((item) => item.id === id);
  if (!tender || !STATUS_OPTIONS.includes(status)) return;
  tender.managerStatus = status;
  state.statuses[id] = status;
  localStorage.setItem(STATUS_STORAGE_KEY, JSON.stringify(state.statuses));
  if (state.selectedId === id) els.detailStatus.value = status;
  renderMetrics();
  renderActions();
  renderTable();
  showToast(`Статус изменен: ${status}`);
}

function resetFilters() {
  state.filters = { query: "", className: "all", country: "all", status: "all" };
  els.searchInput.value = "";
  els.countryFilter.value = "all";
  els.statusFilter.value = "all";
  document.querySelectorAll("[data-class]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.class === "all");
  });
  renderTable();
}

async function copySummary() {
  const classA = state.tenders.filter((tender) => tender.class === "A").length;
  const urgent = state.tenders.filter((tender) => hoursUntil(tender.deadline) <= 48 && hoursUntil(tender.deadline) > 0).length;
  const top = state.tenders
    .filter((tender) => tender.class === "A")
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((tender, index) => `${index + 1}. ${tender.customer}: ${tender.title} (${tender.score} баллов)`)
    .join("\n");
  const text = `Тендеры на ${formatDate(state.data.generatedAt)}\nНайдено: ${state.tenders.length}\nКласс A: ${classA}\nДедлайн до 48 часов: ${urgent}\n\nПриоритеты:\n${top}`;
  try {
    await navigator.clipboard.writeText(text);
    showToast("Сводка скопирована");
  } catch {
    showToast("Не удалось скопировать сводку");
  }
}

function loadStatuses() {
  try {
    return JSON.parse(localStorage.getItem(STATUS_STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => els.toast.classList.remove("is-visible"), 2200);
}

function classRank(className) {
  return { A: 0, B: 1, C: 2 }[className] ?? 3;
}

function decisionClass(decision) {
  if (decision === "Участвовать") return "decision-go";
  if (decision.includes("проверить")) return "decision-check";
  return "decision-hold";
}

function formatAmountCell(tender) {
  if (!Number.isFinite(tender.amount)) return `<div class="amount-value">Не указана</div><div class="amount-note">нужна оценка</div>`;
  return `<div class="amount-value">${formatMoney(tender.amount, tender.currency)}</div>`;
}

function formatAmount(tender) {
  return Number.isFinite(tender.amount) ? formatMoney(tender.amount, tender.currency) : "Не опубликована";
}

function formatMoney(amount, currency) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
}

function compactMoney(amount, currency) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency, notation: "compact", maximumFractionDigits: 1 }).format(amount);
}

function formatDate(value) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Moscow" }).format(new Date(value));
}

function formatDateTime(value) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }).format(new Date(value));
}

function formatShortDateTime(value) {
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Moscow" }).format(new Date(value));
}

function hoursUntil(value) {
  return (new Date(value) - new Date(state.data.generatedAt)) / 3600000;
}

function formatRemaining(value) {
  const hours = Math.max(0, hoursUntil(value));
  if (hours < 24) return `${Math.floor(hours)} ч`;
  const days = Math.floor(hours / 24);
  const rest = Math.floor(hours % 24);
  return `${days} д ${rest} ч`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
