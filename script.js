/* Transport ERP Lite v0.4.0-performance-layout */
'use strict';

const APP_VERSION = 'v0.4.0-performance-layout';
const STORAGE_KEY = 'transport_erp_lite_v020';
const CONFIG_KEY = 'transport_erp_lite_config_v020';
const UI_KEY = 'transport_erp_lite_ui_v040';

const TABLES = [
  'customers',
  'trip_runs',
  'trip_expenses',
  'trip_special_items',
  'hr_settlement_items',
  'subcontractor_settlement_items',
  'accounting_queue_items',
  'accounting_documents',
  'audit_logs'
];

const DEFAULT_STATE = Object.freeze({
  customers: [],
  trip_runs: [],
  trip_expenses: [],
  trip_special_items: [],
  hr_settlement_items: [],
  subcontractor_settlement_items: [],
  accounting_queue_items: [],
  accounting_documents: [],
  audit_logs: []
});

const REVENUE_TYPES = {
  manual: 'กรอกเอง',
  route_based: 'ราคาตามเส้นทาง',
  vehicle_type_based: 'ราคาตามประเภทรถ'
};

const VEHICLE_MODES = {
  company: 'รถบริษัท',
  subcontractor: 'รถร่วม / ผรม.'
};

let state = clone(DEFAULT_STATE);
let currentPage = 'dashboard';
let isBusy = false;

let draftExpenses = [];
let draftSpecials = [];

const app = document.getElementById('app');
const toastEl = document.getElementById('toast');
const versionBadge = document.getElementById('versionBadge');
const modalRoot = document.getElementById('modalRoot');
const loadingOverlay = document.getElementById('loadingOverlay');
const loadingText = document.getElementById('loadingText');
const sidebarToggle = document.getElementById('btnSidebarToggle');

document.addEventListener('DOMContentLoaded', initApp);

function initApp() {
  versionBadge.textContent = APP_VERSION;
  applyUiState();
  bindGlobalEvents();
  loadLocalState();
  loadRemoteData(false, 'กำลังโหลดข้อมูล...').finally(() => renderPage('dashboard'));
}

function bindGlobalEvents() {
  document.querySelector('.tabs').addEventListener('click', (event) => {
    const button = event.target.closest('[data-page]');
    if (!button || isBusy) return;
    renderPage(button.dataset.page);
  });

  document.getElementById('btnSync').addEventListener('click', async () => {
    await loadRemoteData(true, 'กำลัง Sync...');
    renderPage(currentPage);
  });

  if (sidebarToggle) {
    sidebarToggle.addEventListener('click', toggleSidebar);
  }

  modalRoot.addEventListener('click', (event) => {
    if (event.target.matches('[data-close-modal]') && !isBusy) {
      closeActiveModal();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && modalRoot.classList.contains('show') && !isBusy) {
      closeActiveModal();
    }
  });
}


function applyUiState() {
  const ui = getUiState();
  document.body.classList.toggle('sidebar-collapsed', Boolean(ui.sidebarCollapsed));
  if (sidebarToggle) {
    sidebarToggle.setAttribute('aria-expanded', String(!ui.sidebarCollapsed));
    sidebarToggle.setAttribute('aria-label', ui.sidebarCollapsed ? 'ขยายเมนู' : 'ย่อเมนู');
  }
}

function toggleSidebar() {
  const ui = getUiState();
  ui.sidebarCollapsed = !ui.sidebarCollapsed;
  localStorage.setItem(UI_KEY, JSON.stringify(ui));
  applyUiState();
}

function getUiState() {
  try {
    return JSON.parse(localStorage.getItem(UI_KEY) || '{}');
  } catch (error) {
    return {};
  }
}

function routeDisplay(trip) {
  const origin = String(trip.origin_name || '').trim();
  const destination = String(trip.destination_name || '').trim();
  if (origin && destination) return `${origin} → ${destination}`;
  if (origin) return origin;
  if (destination) return destination;
  return trip.route_name || '-';
}

function normalizeTripRecord(trip) {
  if (!trip) return trip;
  const next = { ...trip };
  next.origin_name = next.origin_name || '';
  next.destination_name = next.destination_name || '';
  next.route_name = next.route_name || routeDisplay(next);
  return next;
}



function renderPage(page) {
  if (isBusy) return;
  currentPage = page;
  document.querySelectorAll('.tab').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.page === page);
  });

  const renderers = {
    dashboard: renderDashboard,
    customers: renderCustomers,
    trips: renderTrips,
    hr: renderHrSettlement,
    subcontractor: renderSubcontractorSettlement,
    accounting: renderAccounting,
    settings: renderSettings
  };

  app.innerHTML = '';
  app.appendChild(renderers[page] ? renderers[page]() : renderDashboard());
  app.focus({ preventScroll: true });
}

function renderDashboard() {
  const section = el('section');
  const totals = computeDashboardTotals();
  const pendingTrips = state.trip_runs.filter(t => t.status === 'draft').length;
  const pendingQueue = state.accounting_queue_items.filter(q => q.status === 'pending').length;

  section.innerHTML = `
    <div class="page-title">
      <div>
        <p class="eyebrow">Dashboard</p>
        <h2>ภาพรวม</h2>
      </div>
      <button class="btn" data-open-trip-modal type="button">+ เที่ยววิ่ง</button>
    </div>

    <div class="grid cards">
      <article class="card metric"><span>ลูกค้า</span><strong>${state.customers.length}</strong></article>
      <article class="card metric"><span>เที่ยววิ่ง</span><strong>${state.trip_runs.length}</strong></article>
      <article class="card metric"><span>รออนุมัติ</span><strong>${pendingTrips}</strong></article>
      <article class="card metric"><span>Queue บัญชี</span><strong>${pendingQueue}</strong></article>
    </div>

    <div class="grid two">
      <article class="card">
        <h3>กำไรขาดทุนรวม</h3>
        <dl class="summary-list">
          <div><dt>รายรับก่อน WHT</dt><dd>${money(totals.grossRevenue)}</dd></div>
          <div><dt>WHT รับ</dt><dd>${money(totals.incomeWht)}</dd></div>
          <div><dt>ต้นทุนสุทธิ</dt><dd>${money(totals.companyNetCost)}</dd></div>
          <div class="highlight"><dt>กำไรขั้นต้น</dt><dd>${money(totals.grossProfit)}</dd></div>
        </dl>
      </article>

      <article class="card">
        <h3>สถานะงาน</h3>
        <dl class="summary-list compact">
          <div><dt>HR รอตรวจ</dt><dd>${state.hr_settlement_items.filter(i => i.status === 'pending').length}</dd></div>
          <div><dt>รถร่วมรอตรวจ</dt><dd>${state.subcontractor_settlement_items.filter(i => i.status === 'pending').length}</dd></div>
          <div><dt>เอกสารบัญชี</dt><dd>${state.accounting_documents.length}</dd></div>
        </dl>
      </article>
    </div>

    <article class="card">
      <div class="section-heading">
        <h3>เที่ยววิ่งล่าสุด</h3>
        <button class="btn secondary small" data-page-shortcut="trips" type="button">ดูทั้งหมด</button>
      </div>
      ${renderTripTableHtml(state.trip_runs.slice().reverse().slice(0, 5), false)}
    </article>
  `;

  section.addEventListener('click', (event) => {
    if (event.target.closest('[data-open-trip-modal]')) {
      openTripModal();
      return;
    }
    const shortcut = event.target.closest('[data-page-shortcut]');
    if (shortcut) renderPage(shortcut.dataset.pageShortcut);
  });

  return section;
}


function renderCustomers() {
  const section = el('section');
  section.innerHTML = `
    <div class="page-title">
      <div>
        <p class="eyebrow">Customers</p>
        <h2>ลูกค้า</h2>
      </div>
      <button class="btn" data-open-customer-modal type="button">+ เพิ่มลูกค้า</button>
    </div>

    <article class="card">
      ${renderCustomersTableHtml()}
    </article>
  `;

  section.querySelector('[data-open-customer-modal]').addEventListener('click', openCustomerModal);
  return section;
}


function renderTrips() {
  const section = el('section');

  section.innerHTML = `
    <div class="page-title">
      <div>
        <p class="eyebrow">Trip Runs</p>
        <h2>เที่ยววิ่งงาน</h2>
      </div>
      <button class="btn" data-open-trip-modal type="button">+ คีย์เที่ยววิ่ง</button>
    </div>

    <article class="card">
      ${renderTripTableHtml(state.trip_runs.slice().reverse(), true)}
    </article>
  `;

  section.addEventListener('click', (event) => {
    const openButton = event.target.closest('[data-open-trip-modal]');
    if (openButton) {
      openTripModal();
      return;
    }

    const approveButton = event.target.closest('[data-approve-trip]');
    if (approveButton) {
      handleApproveTrip(approveButton.dataset.approveTrip);
      return;
    }

    const summaryButton = event.target.closest('[data-view-trip-summary]');
    if (summaryButton) {
      openTripSummaryModal(summaryButton.dataset.viewTripSummary);
    }
  });

  return section;
}


function renderHrSettlement() {
  return renderSettlementPage({
    title: 'HR Settlement',
    subtitle: 'รวบรวมค่าเที่ยว พขร. และรายการหัก พขร. ก่อนส่งบัญชี',
    tableName: 'hr_settlement_items',
    targetLabel: 'พขร.'
  });
}

function renderSubcontractorSettlement() {
  return renderSettlementPage({
    title: 'Subcontractor Settlement',
    subtitle: 'รวบรวมค่าเที่ยว / ค่าใช้จ่าย / รายการหักของรถร่วมก่อนส่งบัญชี',
    tableName: 'subcontractor_settlement_items',
    targetLabel: 'ผรม.'
  });
}

function renderSettlementPage({ title, subtitle, tableName, targetLabel }) {
  const section = el('section');
  const items = state[tableName] || [];

  section.innerHTML = `
    <div class="page-title">
      <div>
        <p class="eyebrow">Settlement</p>
        <h2>${escapeHTML(title)}</h2>
      </div>
      <span class="badge">${items.filter(i => i.status === 'pending').length} pending</span>
    </div>

    <article class="card">
      ${renderSettlementTableHtml(items, tableName)}
    </article>
  `;

  section.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-approve-settlement]');
    if (!button) return;
    await handleApproveSettlementItem(tableName, button.dataset.approveSettlement);
  });

  return section;
}


function renderAccounting() {
  const section = el('section');
  const queue = state.accounting_queue_items.slice().reverse();
  const docs = state.accounting_documents.slice().reverse();

  section.innerHTML = `
    <div class="page-title">
      <div>
        <p class="eyebrow">Accounting</p>
        <h2>บัญชี</h2>
      </div>
    </div>

    <div class="grid two">
      <article class="card">
        <div class="section-heading">
          <h3>Queue</h3>
          <span class="badge">${state.accounting_queue_items.filter(q => q.status === 'pending').length} pending</span>
        </div>
        ${renderAccountingQueueHtml(queue)}
      </article>

      <article class="card">
        <div class="section-heading">
          <h3>เอกสาร</h3>
          <span class="badge">${docs.length}</span>
        </div>
        ${renderAccountingDocumentsHtml(docs)}
      </article>
    </div>
  `;

  section.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-create-doc]');
    if (!button) return;
    await handleCreateAccountingDocument(button.dataset.createDoc);
  });

  return section;
}


function renderSettings() {
  const config = getConfig();
  const apiStatus = hasRemoteConfig() ? 'พร้อมใช้งาน' : 'ยังไม่ตั้งค่า';

  const section = el('section');
  section.innerHTML = `
    <div class="page-title">
      <div>
        <p class="eyebrow">Settings</p>
        <h2>ตั้งค่า</h2>
      </div>
      <button class="btn" data-open-settings-modal type="button">ตั้งค่า API</button>
    </div>

    <div class="grid cards settings-cards">
      <article class="card metric"><span>Google Sheet API</span><strong class="metric-text">${escapeHTML(apiStatus)}</strong></article>
      <article class="card metric"><span>Web App URL</span><strong class="metric-text">${config.apiUrl ? 'ตั้งค่าแล้ว' : '-'}</strong></article>
      <article class="card metric"><span>Local data</span><strong class="metric-text">${state.trip_runs.length} trips</strong></article>
      <article class="card metric"><span>Version</span><strong class="metric-text">${APP_VERSION}</strong></article>
    </div>

    <article class="card">
      <div class="section-heading">
        <h3>เครื่องมือ</h3>
        <div class="form-actions">
          <button class="btn secondary small" id="initSheetsBtn" type="button">Initialize Sheets</button>
          <button class="btn secondary small" id="loadDemoBtn" type="button">โหลด demo</button>
          <button class="btn danger small" id="clearLocalBtn" type="button">ล้าง local</button>
        </div>
      </div>
    </article>
  `;

  section.querySelector('[data-open-settings-modal]').addEventListener('click', openSettingsModal);
  section.querySelector('#initSheetsBtn').addEventListener('click', handleInitSheets);
  section.querySelector('#loadDemoBtn').addEventListener('click', () => {
    seedDemoData();
    saveLocalState();
    showToast('โหลดข้อมูล demo แล้ว');
    renderPage(currentPage);
  });
  section.querySelector('#clearLocalBtn').addEventListener('click', () => {
    if (!confirm('ล้างข้อมูล localStorage ทั้งหมด?')) return;
    localStorage.removeItem(STORAGE_KEY);
    state = clone(DEFAULT_STATE);
    showToast('ล้างข้อมูล local แล้ว');
    renderPage(currentPage);
  });

  return section;
}


function openModal({ title, bodyHtml, size = 'large', onReady }) {
  modalRoot.innerHTML = `
    <div class="modal-backdrop" data-close-modal></div>
    <section class="modal-card ${escapeAttr(size)}" role="dialog" aria-modal="true" aria-label="${escapeAttr(title)}">
      <header class="modal-header">
        <h2>${escapeHTML(title)}</h2>
        <button class="icon-btn" data-close-modal type="button" aria-label="ปิด">×</button>
      </header>
      <div class="modal-body">${bodyHtml}</div>
    </section>
  `;
  modalRoot.className = 'modal-root show';
  document.body.classList.add('modal-open');
  const card = modalRoot.querySelector('.modal-card');
  if (typeof onReady === 'function') onReady(card);
  const firstInput = card.querySelector('input, select, textarea, button');
  if (firstInput) firstInput.focus({ preventScroll: true });
}

function closeActiveModal() {
  modalRoot.innerHTML = '';
  modalRoot.className = 'modal-root';
  document.body.classList.remove('modal-open');
}

function openCustomerModal() {
  openModal({
    title: 'เพิ่มลูกค้า',
    size: 'medium',
    bodyHtml: `
      <form id="customerForm" class="form-card modal-form">
        <label>ชื่อลูกค้า
          <input name="name" required placeholder="ชื่อบริษัท / ลูกค้า" />
        </label>
        <label>เลขผู้เสียภาษี
          <input name="tax_id" />
        </label>
        <label>ที่อยู่ใบกำกับภาษี
          <textarea name="billing_address" rows="3"></textarea>
        </label>
        <div class="form-grid">
          <label>รูปแบบรายได้
            <select name="revenue_type">
              ${optionsHtml(REVENUE_TYPES)}
            </select>
          </label>
          <label>Credit term
            <input name="credit_term_days" type="number" min="0" value="30" />
          </label>
          <label>WHT %
            <input name="default_wht_rate" type="number" step="0.01" min="0" value="1" />
          </label>
          <label>VAT %
            <input name="default_vat_rate" type="number" step="0.01" min="0" value="0" />
          </label>
        </div>
        <footer class="modal-actions">
          <button class="btn secondary" data-close-modal type="button">ยกเลิก</button>
          <button class="btn" type="submit">บันทึก</button>
        </footer>
      </form>
    `,
    onReady: (modal) => {
      modal.querySelector('#customerForm').addEventListener('submit', handleCreateCustomer);
    }
  });
}

function openSettingsModal() {
  const config = getConfig();
  openModal({
    title: 'ตั้งค่า API',
    size: 'medium',
    bodyHtml: `
      <form id="configForm" class="form-card modal-form">
        <label>Web App URL
          <input name="api_url" value="${escapeAttr(config.apiUrl || '')}" placeholder="https://script.google.com/macros/s/.../exec" />
        </label>
        <label>API Token
          <input name="api_token" value="${escapeAttr(config.apiToken || '')}" placeholder="APP_TOKEN" />
        </label>
        <footer class="modal-actions">
          <button class="btn secondary" data-close-modal type="button">ยกเลิก</button>
          <button class="btn" type="submit">บันทึก</button>
        </footer>
      </form>
    `,
    onReady: (modal) => {
      modal.querySelector('#configForm').addEventListener('submit', handleSaveConfig);
    }
  });
}

function openTripModal() {
  if (draftExpenses.length === 0) draftExpenses.push(defaultExpenseDraft());
  if (draftSpecials.length === 0) draftSpecials.push(defaultSpecialDraft());

  openModal({
    title: 'คีย์เที่ยววิ่งงาน',
    size: 'xlarge',
    bodyHtml: renderTripFormHtml(),
    onReady: (modal) => {
      bindTripFormEvents(modal);
      updateLiveProfitSummary(modal.querySelector('#tripForm'));
    }
  });
}

function openTripSummaryModal(tripId) {
  const trip = state.trip_runs.find((item) => item.id === tripId);
  if (!trip) return;
  const summary = calculateTripSummary(trip, getExpensesByTrip(trip.id), getSpecialsByTrip(trip.id));
  openModal({
    title: `สรุป ${trip.trip_no}`,
    size: 'medium',
    bodyHtml: `
      <div class="summary-meta">
        <div><span>ลูกค้า</span><strong>${escapeHTML(trip.customer_name)}</strong></div>
        <div><span>ต้นทาง</span><strong>${escapeHTML(trip.origin_name || routeDisplay(trip))}</strong></div>
        <div><span>ปลายทาง</span><strong>${escapeHTML(trip.destination_name || '-')}</strong></div>
        <div><span>รถ</span><strong>${escapeHTML(VEHICLE_MODES[trip.vehicle_mode] || trip.vehicle_mode)}</strong></div>
      </div>
      ${renderProfitSummaryHtml(summary)}
      <footer class="modal-actions">
        <button class="btn" data-close-modal type="button">ปิด</button>
      </footer>
    `
  });
}

function renderTripFormHtml() {
  return `
    <form id="tripForm" class="form-card modal-form">
      <div class="form-section">
        <h3>ข้อมูลหลัก</h3>
        <div class="form-grid four">
          <label>ลูกค้า
            <select name="customer_id" required>
              <option value="">เลือกลูกค้า</option>
              ${state.customers.map(c => `<option value="${escapeAttr(c.id)}">${escapeHTML(c.name)}</option>`).join('')}
            </select>
          </label>
          <label>วันที่วิ่ง
            <input name="trip_date" type="date" required value="${todayISO()}" />
          </label>
          <label>ต้นทาง
            <input name="origin_name" required />
          </label>
          <label>ปลายทาง
            <input name="destination_name" required />
          </label>
          <label>ประเภทรถ
            <input name="vehicle_type" />
          </label>
        </div>

        <div class="form-grid four">
          <label>รูปแบบรถ
            <select name="vehicle_mode">
              ${optionsHtml(VEHICLE_MODES)}
            </select>
          </label>
          <label>ทะเบียน / รถ
            <input name="vehicle_no" />
          </label>
          <label>พขร.
            <input name="driver_name" />
          </label>
          <label>ผรม. / รถร่วม
            <input name="subcontractor_name" />
          </label>
        </div>
      </div>

      <div class="form-section">
        <h3>รายรับ / รายจ่ายหลัก</h3>
        <div class="form-grid four">
          <label>ค่าขนส่งจากลูกค้า
            <input name="freight_income_amount" type="number" step="0.01" min="0" value="0" />
          </label>
          <label>WHT รับ %
            <input name="freight_wht_rate" type="number" step="0.01" min="0" value="1" />
          </label>
          <label>VAT รับ %
            <input name="freight_vat_rate" type="number" step="0.01" min="0" value="0" />
          </label>
          <label>ค่าเที่ยว พขร.
            <input name="driver_trip_pay" type="number" step="0.01" min="0" value="0" />
          </label>
        </div>

        <div class="form-grid four">
          <label>ค่าจ้างรถร่วม
            <input name="subcontractor_pay_amount" type="number" step="0.01" min="0" value="0" />
          </label>
          <label>WHT จ่ายรถร่วม %
            <input name="subcontractor_wht_rate" type="number" step="0.01" min="0" value="0" />
          </label>
          <label>VAT จ่ายรถร่วม %
            <input name="subcontractor_vat_rate" type="number" step="0.01" min="0" value="0" />
          </label>
          <label>หมายเหตุ
            <input name="note" />
          </label>
        </div>
      </div>

      <div class="modal-split">
        <section class="panel flat">
          <div class="section-heading">
            <h3>ค่าใช้จ่ายปกติ</h3>
            <button class="btn secondary small" id="addExpenseBtn" type="button">+ เพิ่ม</button>
          </div>
          <div id="expenseDraftList">${draftExpenses.map(renderExpenseDraftHtml).join('')}</div>
        </section>

        <section class="panel flat">
          <div class="section-heading">
            <h3>ค่าพิเศษ</h3>
            <button class="btn secondary small" id="addSpecialBtn" type="button">+ เพิ่ม</button>
          </div>
          <div id="specialDraftList">${draftSpecials.map(renderSpecialDraftHtml).join('')}</div>
        </section>
      </div>

      <section class="panel flat">
        <div class="section-heading">
          <h3>สรุปกำไรขาดทุน</h3>
        </div>
        <div id="liveProfitSummary"></div>
      </section>

      <footer class="modal-actions sticky-actions">
        <button class="btn secondary" id="clearTripDraftBtn" type="button">ล้างแบบร่าง</button>
        <button class="btn secondary" data-close-modal type="button">ยกเลิก</button>
        <button class="btn" type="submit">บันทึกเที่ยววิ่ง</button>
      </footer>
    </form>
  `;
}

function renderTripDraftLists(root) {
  const expenseList = root.querySelector('#expenseDraftList');
  const specialList = root.querySelector('#specialDraftList');
  if (expenseList) expenseList.innerHTML = draftExpenses.map(renderExpenseDraftHtml).join('');
  if (specialList) specialList.innerHTML = draftSpecials.map(renderSpecialDraftHtml).join('');
}

function bindTripFormEvents(section) {
  const form = section.querySelector('#tripForm');

  form.addEventListener('submit', handleCreateTrip);
  form.addEventListener('input', () => {
    collectDraftRowsFromDom(section);
    updateLiveProfitSummary(form);
  });
  form.addEventListener('change', (event) => {
    const deductCheckbox = event.target.closest('[data-expense-deduct]');
    if (deductCheckbox) {
      const row = deductCheckbox.closest('.line-item');
      const amountInput = row.querySelector('[data-expense-amount]');
      const deductionInput = row.querySelector('[data-expense-deduction]');
      if (deductCheckbox.checked) {
        deductionInput.value = toNumber(amountInput.value);
      } else {
        deductionInput.value = 0;
      }
    }
    collectDraftRowsFromDom(section);
    updateLiveProfitSummary(form);
  });

  const addExpenseBtn = section.querySelector('#addExpenseBtn');
  if (addExpenseBtn) {
    addExpenseBtn.addEventListener('click', () => {
      collectDraftRowsFromDom(section);
      draftExpenses.push(defaultExpenseDraft());
      renderTripDraftLists(section);
      updateLiveProfitSummary(form);
    });
  }

  const addSpecialBtn = section.querySelector('#addSpecialBtn');
  if (addSpecialBtn) {
    addSpecialBtn.addEventListener('click', () => {
      collectDraftRowsFromDom(section);
      draftSpecials.push(defaultSpecialDraft());
      renderTripDraftLists(section);
      updateLiveProfitSummary(form);
    });
  }

  const clearTripDraftBtn = section.querySelector('#clearTripDraftBtn');
  if (clearTripDraftBtn) {
    clearTripDraftBtn.addEventListener('click', () => {
      draftExpenses = [defaultExpenseDraft()];
      draftSpecials = [defaultSpecialDraft()];
      renderTripDraftLists(section);
      updateLiveProfitSummary(form);
    });
  }

  section.addEventListener('click', (event) => {
    const expenseRemove = event.target.closest('[data-remove-expense]');
    if (expenseRemove) {
      collectDraftRowsFromDom(section);
      draftExpenses.splice(Number(expenseRemove.dataset.removeExpense), 1);
      if (draftExpenses.length === 0) draftExpenses.push(defaultExpenseDraft());
      renderTripDraftLists(section);
      updateLiveProfitSummary(form);
      return;
    }

    const specialRemove = event.target.closest('[data-remove-special]');
    if (specialRemove) {
      collectDraftRowsFromDom(section);
      draftSpecials.splice(Number(specialRemove.dataset.removeSpecial), 1);
      if (draftSpecials.length === 0) draftSpecials.push(defaultSpecialDraft());
      renderTripDraftLists(section);
      updateLiveProfitSummary(form);
    }
  });
}


async function handleCreateCustomer(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formToObject(form);

  const customer = {
    id: makeId('CUS'),
    name: values.name.trim(),
    tax_id: values.tax_id.trim(),
    billing_address: values.billing_address.trim(),
    revenue_type: values.revenue_type,
    credit_term_days: toNumber(values.credit_term_days),
    default_wht_rate: toNumber(values.default_wht_rate),
    default_vat_rate: toNumber(values.default_vat_rate),
    is_active: true,
    created_at: nowISO(),
    updated_at: nowISO()
  };

  if (!customer.name) {
    showToast('กรุณากรอกชื่อลูกค้า', 'error');
    return;
  }

  const ok = await executeMutation('createCustomer', { customer }, () => {
    state.customers.push(customer);
  }, 'กำลังบันทึกลูกค้า...');

  if (!ok) return;
  form.reset();
  closeActiveModal();
  showToast('บันทึกลูกค้าแล้ว');
  renderPage('customers');
}

async function handleCreateTrip(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const values = formToObject(form);
  collectDraftRowsFromDom(document);

  const customer = getCustomer(values.customer_id);
  if (!customer) {
    showToast('กรุณาเลือกลูกค้า', 'error');
    return;
  }

  const originName = values.origin_name.trim();
  const destinationName = values.destination_name.trim();
  const routeName = `${originName} → ${destinationName}`;

  const trip = {
    id: makeId('TRIP'),
    trip_no: nextRunningNo('TRIP', state.trip_runs.length + 1),
    customer_id: customer.id,
    customer_name: customer.name,
    trip_date: values.trip_date,
    origin_name: originName,
    destination_name: destinationName,
    route_name: routeName,
    vehicle_type: values.vehicle_type.trim(),
    vehicle_mode: values.vehicle_mode,
    vehicle_no: values.vehicle_no.trim(),
    driver_name: values.driver_name.trim(),
    subcontractor_name: values.subcontractor_name.trim(),
    freight_income_amount: toNumber(values.freight_income_amount),
    freight_wht_rate: toNumber(values.freight_wht_rate),
    freight_vat_rate: toNumber(values.freight_vat_rate),
    driver_trip_pay: toNumber(values.driver_trip_pay),
    subcontractor_pay_amount: toNumber(values.subcontractor_pay_amount),
    subcontractor_wht_rate: toNumber(values.subcontractor_wht_rate),
    subcontractor_vat_rate: toNumber(values.subcontractor_vat_rate),
    note: values.note.trim(),
    status: 'draft',
    approved_at: '',
    created_at: nowISO(),
    updated_at: nowISO()
  };

  if (!trip.trip_date || !trip.origin_name || !trip.destination_name) {
    showToast('กรุณากรอกวันที่ ต้นทาง และปลายทาง', 'error');
    return;
  }

  const expenses = draftExpenses
    .filter((item) => item.description || item.amount > 0)
    .map((item) => ({
      ...item,
      id: makeId('EXP'),
      trip_run_id: trip.id,
      amount: toNumber(item.amount),
      deduction_amount: item.deduct_from_driver ? toNumber(item.deduction_amount || item.amount) : 0,
      deduction_target_type: trip.vehicle_mode === 'company' ? 'driver' : 'subcontractor',
      payment_status: 'pending',
      deduction_status: item.deduct_from_driver ? 'pending' : '',
      created_at: nowISO()
    }));

  const specials = draftSpecials
    .filter((item) => item.description || toNumber(item.customer_charge_rate) > 0 || toNumber(item.payable_rate) > 0)
    .map((item) => normalizeSpecialDraft(item, trip));

  const ok = await executeMutation('createTrip', { trip, expenses, specials }, () => {
    state.trip_runs.push(trip);
    state.trip_expenses.push(...expenses);
    state.trip_special_items.push(...specials);
  }, 'กำลังบันทึกเที่ยววิ่ง...');

  if (!ok) return;
  draftExpenses = [defaultExpenseDraft()];
  draftSpecials = [defaultSpecialDraft()];
  closeActiveModal();
  showToast('บันทึกเที่ยววิ่งแล้ว');
  renderPage('trips');
}

async function handleApproveTrip(tripId) {
  const trip = state.trip_runs.find((item) => item.id === tripId);
  if (!trip) return;

  if (trip.status !== 'draft') {
    showToast('เที่ยววิ่งนี้ถูกอนุมัติแล้ว', 'error');
    return;
  }

  if (!confirm(`อนุมัติเที่ยววิ่ง ${trip.trip_no}?`)) return;

  const generated = generateItemsOnTripApproval(trip);

  const ok = await executeMutation('approveTrip', { trip_id: tripId, generated }, () => {
    trip.status = 'approved';
    trip.approved_at = nowISO();
    trip.updated_at = nowISO();
    state.accounting_queue_items.push(...generated.accounting_queue_items);
    state.hr_settlement_items.push(...generated.hr_settlement_items);
    state.subcontractor_settlement_items.push(...generated.subcontractor_settlement_items);
  }, 'กำลังอนุมัติเที่ยววิ่ง...');

  if (!ok) return;
  showToast('อนุมัติเที่ยววิ่งและส่งต่อแล้ว');
  renderPage('trips');
}

async function handleApproveSettlementItem(tableName, itemId) {
  const item = state[tableName].find((entry) => entry.id === itemId);
  if (!item || item.status !== 'pending') return;

  const queueItem = buildAccountingQueueFromSettlement(item, tableName);

  const ok = await executeMutation('approveSettlementItem', { table_name: tableName, item_id: itemId, queue_item: queueItem }, () => {
    item.status = 'approved';
    item.approved_at = nowISO();
    state.accounting_queue_items.push(queueItem);
  }, 'กำลังส่งบัญชี...');

  if (!ok) return;
  showToast('อนุมัติ settlement และส่งบัญชีแล้ว');
  renderPage(currentPage);
}

async function handleCreateAccountingDocument(queueId) {
  const item = state.accounting_queue_items.find((entry) => entry.id === queueId);
  if (!item || item.status !== 'pending') return;

  const documentType = inferDocumentType(item);
  const doc = {
    id: makeId(documentType),
    document_no: nextRunningNo(documentType, state.accounting_documents.length + 1),
    document_type: documentType,
    queue_item_id: item.id,
    source_type: item.source_type,
    source_id: item.source_id,
    party_type: item.party_type,
    party_name: item.party_name,
    description: item.description,
    amount_before_vat: toNumber(item.amount_before_vat),
    vat_rate: toNumber(item.vat_rate),
    vat_amount: toNumber(item.vat_amount),
    wht_rate: toNumber(item.wht_rate),
    wht_amount: toNumber(item.wht_amount),
    net_amount: toNumber(item.net_amount),
    status: 'issued',
    created_at: nowISO()
  };

  const ok = await executeMutation('createAccountingDocument', { queue_id: queueId, document: doc }, () => {
    item.status = 'documented';
    item.document_id = doc.id;
    state.accounting_documents.push(doc);
  }, 'กำลังสร้างเอกสาร...');

  if (!ok) return;
  showToast(`สร้างเอกสาร ${doc.document_no} แล้ว`);
  renderPage('accounting');
}

async function handleSaveConfig(event) {
  event.preventDefault();
  const values = formToObject(event.currentTarget);
  const config = {
    apiUrl: values.api_url.trim(),
    apiToken: values.api_token.trim()
  };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  closeActiveModal();
  showToast('บันทึก config แล้ว');
  await loadRemoteData(true);
  renderPage('settings');
}

async function handleInitSheets() {
  if (isBusy) return;
  setBusy(true, 'กำลัง Initialize Sheets...');
  try {
    await apiCall('initSheets', {});
    showToast('Initialize Google Sheets แล้ว');
    setBusy(false);
    await loadRemoteData(true, 'กำลังโหลดข้อมูล...');
  } catch (error) {
    showToast(error.message, 'error');
    setBusy(false);
  }
}

function generateItemsOnTripApproval(trip) {
  const expenses = getExpensesByTrip(trip.id);
  const specials = getSpecialsByTrip(trip.id);
  const accountingItems = [];
  const hrItems = [];
  const subcontractorItems = [];

  if (toNumber(trip.freight_income_amount) > 0) {
    accountingItems.push(makeAccountingQueueItem({
      source_type: 'trip_run',
      source_id: trip.id,
      accounting_side: 'ar',
      queue_type: 'customer_billing',
      document_type_hint: 'BILL',
      party_type: 'customer',
      party_name: trip.customer_name,
      description: `${trip.trip_no} ค่าขนส่ง ${routeDisplay(trip)}`,
      amount_before_vat: trip.freight_income_amount,
      vat_rate: trip.freight_vat_rate,
      wht_rate: trip.freight_wht_rate
    }));
  }

  specials.filter((item) => boolValue(item.bill_to_customer)).forEach((item) => {
    accountingItems.push(makeAccountingQueueItem({
      source_type: 'trip_special_item',
      source_id: item.id,
      accounting_side: 'ar',
      queue_type: 'customer_billing',
      document_type_hint: 'BILL',
      party_type: 'customer',
      party_name: trip.customer_name,
      description: `${trip.trip_no} ${item.description}`,
      amount_before_vat: item.customer_charge_amount,
      vat_rate: item.customer_vat_rate,
      wht_rate: item.customer_wht_rate
    }));
  });

  expenses.forEach((expense) => {
    if (boolValue(expense.deduct_from_driver)) {
      const settlement = makeSettlementItem({
        trip,
        item_type: 'deduction',
        direction: 'receivable',
        description: `หัก${trip.vehicle_mode === 'company' ? 'พขร.' : 'ผรม.'}: ${expense.description}`,
        amount: expense.deduction_amount || expense.amount,
        source_type: 'trip_expense',
        source_id: expense.id
      });
      if (trip.vehicle_mode === 'company') hrItems.push(settlement);
      else subcontractorItems.push(settlement);
    }

    if (!boolValue(expense.deduct_from_driver) && toNumber(expense.amount) > 0) {
      accountingItems.push(makeAccountingQueueItem({
        source_type: 'trip_expense',
        source_id: expense.id,
        accounting_side: 'ap',
        queue_type: 'normal_expense',
        document_type_hint: 'PV',
        party_type: expense.paid_by || 'company',
        party_name: expense.payee_name || expense.paid_by || 'ผู้รับเงิน',
        description: `${trip.trip_no} ${expense.description}`,
        amount_before_vat: expense.amount,
        vat_rate: expense.vat_rate || 0,
        wht_rate: expense.wht_rate || 0
      }));
    }
  });

  specials.filter((item) => boolValue(item.payable_to_party)).forEach((item) => {
    const settlement = makeSettlementItem({
      trip,
      item_type: 'special_payable',
      direction: 'payable',
      description: `ค่าพิเศษจ่าย: ${item.description}`,
      amount: item.payable_amount,
      source_type: 'trip_special_item',
      source_id: item.id,
      vat_rate: item.payable_vat_rate,
      wht_rate: item.payable_wht_rate
    });
    if (trip.vehicle_mode === 'company') hrItems.push(settlement);
    else subcontractorItems.push(settlement);
  });

  if (trip.vehicle_mode === 'company' && toNumber(trip.driver_trip_pay) > 0) {
    hrItems.push(makeSettlementItem({
      trip,
      item_type: 'trip_allowance',
      direction: 'payable',
      description: `${trip.trip_no} ค่าเที่ยว พขร.`,
      amount: trip.driver_trip_pay,
      source_type: 'trip_run',
      source_id: trip.id
    }));
  }

  if (trip.vehicle_mode === 'subcontractor' && toNumber(trip.subcontractor_pay_amount) > 0) {
    subcontractorItems.push(makeSettlementItem({
      trip,
      item_type: 'subcontractor_pay',
      direction: 'payable',
      description: `${trip.trip_no} ค่าจ้างรถร่วม / ผรม.`,
      amount: trip.subcontractor_pay_amount,
      source_type: 'trip_run',
      source_id: trip.id,
      vat_rate: trip.subcontractor_vat_rate,
      wht_rate: trip.subcontractor_wht_rate
    }));
  }

  return {
    accounting_queue_items: accountingItems,
    hr_settlement_items: hrItems,
    subcontractor_settlement_items: subcontractorItems
  };
}

function buildAccountingQueueFromSettlement(item, tableName) {
  const isReceivable = item.direction === 'receivable';
  const documentTypeHint = isReceivable ? 'RV' : 'PV';

  return makeAccountingQueueItem({
    source_type: tableName,
    source_id: item.id,
    accounting_side: isReceivable ? 'ar' : 'ap',
    queue_type: item.item_type,
    document_type_hint: documentTypeHint,
    party_type: tableName === 'hr_settlement_items' ? 'driver' : 'subcontractor',
    party_name: item.target_name,
    description: item.description,
    amount_before_vat: item.amount,
    vat_rate: item.vat_rate || 0,
    wht_rate: item.wht_rate || 0
  });
}

function makeAccountingQueueItem(input) {
  const amount = toNumber(input.amount_before_vat);
  const vatRate = toNumber(input.vat_rate);
  const whtRate = toNumber(input.wht_rate);
  const vatAmount = round2(amount * vatRate / 100);
  const whtAmount = round2(amount * whtRate / 100);
  const netAmount = round2(amount + vatAmount - whtAmount);

  return {
    id: makeId('AQ'),
    source_type: input.source_type,
    source_id: input.source_id,
    accounting_side: input.accounting_side,
    queue_type: input.queue_type,
    document_type_hint: input.document_type_hint,
    party_type: input.party_type,
    party_name: input.party_name,
    description: input.description,
    amount_before_vat: amount,
    vat_rate: vatRate,
    vat_amount: vatAmount,
    wht_rate: whtRate,
    wht_amount: whtAmount,
    net_amount: netAmount,
    status: 'pending',
    document_id: '',
    created_at: nowISO()
  };
}

function makeSettlementItem({ trip, item_type, direction, description, amount, source_type, source_id, vat_rate = 0, wht_rate = 0 }) {
  return {
    id: makeId('SET'),
    trip_run_id: trip.id,
    trip_no: trip.trip_no,
    source_type,
    source_id,
    target_type: trip.vehicle_mode === 'company' ? 'driver' : 'subcontractor',
    target_name: trip.vehicle_mode === 'company' ? (trip.driver_name || 'พขร.') : (trip.subcontractor_name || 'ผรม.'),
    item_type,
    direction,
    description,
    amount: toNumber(amount),
    vat_rate: toNumber(vat_rate),
    wht_rate: toNumber(wht_rate),
    status: 'pending',
    approved_at: '',
    created_at: nowISO()
  };
}

function inferDocumentType(item) {
  if (item.document_type_hint) return item.document_type_hint;
  if (item.accounting_side === 'ap') return 'PV';
  if (item.queue_type === 'customer_billing') return 'BILL';
  return 'RV';
}

function updateLiveProfitSummary(form) {
  if (!form) return;
  const values = formToObject(form);
  const pseudoTrip = {
    freight_income_amount: toNumber(values.freight_income_amount),
    freight_wht_rate: toNumber(values.freight_wht_rate),
    freight_vat_rate: toNumber(values.freight_vat_rate),
    driver_trip_pay: toNumber(values.driver_trip_pay),
    subcontractor_pay_amount: toNumber(values.subcontractor_pay_amount),
    subcontractor_wht_rate: toNumber(values.subcontractor_wht_rate),
    subcontractor_vat_rate: toNumber(values.subcontractor_vat_rate),
    vehicle_mode: values.vehicle_mode
  };
  const specials = draftSpecials.map((item) => normalizeSpecialDraft(item, pseudoTrip));
  const summary = calculateTripSummary(pseudoTrip, draftExpenses, specials);
  const target = form.querySelector('#liveProfitSummary');
  if (target) target.innerHTML = renderProfitSummaryHtml(summary);
}

function calculateTripSummary(trip, expenses, specials) {
  const freightIncome = toNumber(trip.freight_income_amount);
  const customerSpecials = specials.reduce((sum, item) => sum + (boolValue(item.bill_to_customer) ? toNumber(item.customer_charge_amount) : 0), 0);
  const grossRevenue = round2(freightIncome + customerSpecials);

  const freightWht = round2(freightIncome * toNumber(trip.freight_wht_rate) / 100);
  const specialCustomerWht = specials.reduce((sum, item) => sum + (boolValue(item.bill_to_customer) ? toNumber(item.customer_charge_amount) * toNumber(item.customer_wht_rate) / 100 : 0), 0);
  const incomeWht = round2(freightWht + specialCustomerWht);

  const freightVat = round2(freightIncome * toNumber(trip.freight_vat_rate) / 100);
  const specialCustomerVat = specials.reduce((sum, item) => sum + (boolValue(item.bill_to_customer) ? toNumber(item.customer_charge_amount) * toNumber(item.customer_vat_rate) / 100 : 0), 0);
  const incomeVat = round2(freightVat + specialCustomerVat);

  const normalExpenses = expenses.reduce((sum, item) => sum + toNumber(item.amount), 0);
  const deductions = expenses.reduce((sum, item) => sum + (boolValue(item.deduct_from_driver) ? toNumber(item.deduction_amount || item.amount) : 0), 0);
  const payableSpecials = specials.reduce((sum, item) => sum + (boolValue(item.payable_to_party) ? toNumber(item.payable_amount) : 0), 0);
  const driverTripPay = trip.vehicle_mode === 'company' ? toNumber(trip.driver_trip_pay) : 0;
  const subcontractorPay = trip.vehicle_mode === 'subcontractor' ? toNumber(trip.subcontractor_pay_amount) : 0;

  const cashOutBeforeDeduction = round2(normalExpenses + payableSpecials + driverTripPay + subcontractorPay);
  const companyNetCost = round2(cashOutBeforeDeduction - deductions);
  const grossProfit = round2(grossRevenue - companyNetCost);
  const netCashReceiveEstimate = round2(grossRevenue + incomeVat - incomeWht);

  return {
    grossRevenue,
    incomeWht,
    incomeVat,
    netCashReceiveEstimate,
    normalExpenses,
    payableSpecials,
    driverTripPay,
    subcontractorPay,
    cashOutBeforeDeduction,
    deductions,
    companyNetCost,
    grossProfit
  };
}

function computeDashboardTotals() {
  return state.trip_runs.reduce((acc, trip) => {
    const summary = calculateTripSummary(trip, getExpensesByTrip(trip.id), getSpecialsByTrip(trip.id));
    acc.grossRevenue += summary.grossRevenue;
    acc.incomeWht += summary.incomeWht;
    acc.companyNetCost += summary.companyNetCost;
    acc.grossProfit += summary.grossProfit;
    return acc;
  }, { grossRevenue: 0, incomeWht: 0, companyNetCost: 0, grossProfit: 0 });
}

function renderProfitSummaryHtml(summary) {
  return `
    <dl class="summary-list">
      <div><dt>รายรับก่อน WHT</dt><dd>${money(summary.grossRevenue)}</dd></div>
      <div><dt>WHT รับ</dt><dd>${money(summary.incomeWht)}</dd></div>
      <div><dt>VAT รับ</dt><dd>${money(summary.incomeVat)}</dd></div>
      <div><dt>ยอดรับสุทธิโดยประมาณ</dt><dd>${money(summary.netCashReceiveEstimate)}</dd></div>
      <div><dt>เงินจ่ายออกก่อนหักคืน</dt><dd>${money(summary.cashOutBeforeDeduction)}</dd></div>
      <div><dt>รายการหักคืน พขร./ผรม.</dt><dd>${money(summary.deductions)}</dd></div>
      <div><dt>ต้นทุนสุทธิของบริษัท</dt><dd>${money(summary.companyNetCost)}</dd></div>
      <div class="highlight"><dt>กำไรขั้นต้น</dt><dd>${money(summary.grossProfit)}</dd></div>
    </dl>
  `;
}

function renderCustomersTableHtml() {
  if (!state.customers.length) return emptyStateHtml('ยังไม่มีลูกค้า', 'เพิ่มลูกค้าก่อนคีย์เที่ยววิ่ง');
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>ชื่อลูกค้า</th><th>รูปแบบรายได้</th><th>WHT</th><th>VAT</th><th>Credit</th></tr></thead>
        <tbody>
          ${state.customers.map((customer) => `
            <tr>
              <td>${escapeHTML(customer.name)}</td>
              <td>${escapeHTML(REVENUE_TYPES[customer.revenue_type] || customer.revenue_type)}</td>
              <td>${formatPercent(customer.default_wht_rate)}</td>
              <td>${formatPercent(customer.default_vat_rate)}</td>
              <td>${toNumber(customer.credit_term_days)} วัน</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderTripTableHtml(trips, withActions) {
  if (!trips.length) return emptyStateHtml('ยังไม่มีเที่ยววิ่ง', 'เพิ่มเที่ยววิ่งเพื่อเริ่ม workflow');

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>เลขที่</th><th>วันที่</th><th>ลูกค้า</th><th>ต้นทาง</th><th>ปลายทาง</th><th>รถ</th><th>สถานะ</th><th>กำไรขั้นต้น</th>${withActions ? '<th>Action</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${trips.map((trip) => {
            const summary = calculateTripSummary(trip, getExpensesByTrip(trip.id), getSpecialsByTrip(trip.id));
            const actions = withActions
              ? `<div class="row-actions">
                   <button class="btn secondary small" data-view-trip-summary="${escapeAttr(trip.id)}" type="button">สรุป</button>
                   ${trip.status === 'draft' ? `<button class="btn small" data-approve-trip="${escapeAttr(trip.id)}" type="button">อนุมัติ</button>` : '<span class="muted">ส่งต่อแล้ว</span>'}
                 </div>`
              : '';
            return `
              <tr>
                <td>${escapeHTML(trip.trip_no)}</td>
                <td>${formatDate(trip.trip_date)}</td>
                <td>${escapeHTML(trip.customer_name)}</td>
                <td>${escapeHTML(trip.origin_name || routeDisplay(trip))}</td>
                <td>${escapeHTML(trip.destination_name || '-')}</td>
                <td>${escapeHTML(VEHICLE_MODES[trip.vehicle_mode] || trip.vehicle_mode)}</td>
                <td><span class="status ${escapeAttr(trip.status)}">${statusLabel(trip.status)}</span></td>
                <td>${money(summary.grossProfit)}</td>
                ${withActions ? `<td>${actions}</td>` : ''}
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}


function renderSettlementTableHtml(items, tableName) {
  if (!items.length) return emptyStateHtml('ยังไม่มีรายการ settlement', 'เมื่ออนุมัติเที่ยววิ่ง ระบบจะส่งรายการมาที่นี่');

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>เที่ยว</th><th>ผู้เกี่ยวข้อง</th><th>ประเภท</th><th>ทิศทาง</th><th>รายละเอียด</th><th>จำนวน</th><th>สถานะ</th><th>Action</th></tr>
        </thead>
        <tbody>
          ${items.slice().reverse().map((item) => `
            <tr>
              <td>${escapeHTML(item.trip_no)}</td>
              <td>${escapeHTML(item.target_name)}</td>
              <td>${escapeHTML(settlementTypeLabel(item.item_type))}</td>
              <td>${escapeHTML(item.direction === 'payable' ? 'จ่าย' : 'รับ / หักคืน')}</td>
              <td>${escapeHTML(item.description)}</td>
              <td>${money(item.amount)}</td>
              <td><span class="status ${escapeAttr(item.status)}">${statusLabel(item.status)}</span></td>
              <td>${item.status === 'pending' ? `<button class="btn small" data-approve-settlement="${escapeAttr(item.id)}" type="button">อนุมัติส่งบัญชี</button>` : '<span class="muted">ส่งบัญชีแล้ว</span>'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderAccountingQueueHtml(queue) {
  if (!queue.length) return emptyStateHtml('ยังไม่มี Accounting Queue', 'รายการจะเข้ามาหลังอนุมัติเที่ยววิ่งหรือ settlement');

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>ฝั่ง</th><th>เอกสาร</th><th>คู่ค้า</th><th>รายละเอียด</th><th>ก่อน VAT</th><th>VAT</th><th>WHT</th><th>สุทธิ</th><th>สถานะ</th><th>Action</th></tr>
        </thead>
        <tbody>
          ${queue.map((item) => `
            <tr>
              <td>${escapeHTML(item.accounting_side === 'ar' ? 'ขารับ' : 'ขาจ่าย')}</td>
              <td>${escapeHTML(item.document_type_hint)}</td>
              <td>${escapeHTML(item.party_name)}</td>
              <td>${escapeHTML(item.description)}</td>
              <td>${money(item.amount_before_vat)}</td>
              <td>${money(item.vat_amount)}</td>
              <td>${money(item.wht_amount)}</td>
              <td>${money(item.net_amount)}</td>
              <td><span class="status ${escapeAttr(item.status)}">${statusLabel(item.status)}</span></td>
              <td>${item.status === 'pending' ? `<button class="btn small" data-create-doc="${escapeAttr(item.id)}" type="button">สร้างเอกสาร</button>` : '<span class="muted">สร้างแล้ว</span>'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderAccountingDocumentsHtml(docs) {
  if (!docs.length) return emptyStateHtml('ยังไม่มีเอกสารบัญชี', 'กดสร้างเอกสารจาก Accounting Queue');

  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>เลขเอกสาร</th><th>ประเภท</th><th>คู่ค้า</th><th>รายละเอียด</th><th>ยอดสุทธิ</th><th>สถานะ</th><th>วันที่สร้าง</th></tr>
        </thead>
        <tbody>
          ${docs.map((doc) => `
            <tr>
              <td>${escapeHTML(doc.document_no)}</td>
              <td>${escapeHTML(doc.document_type)}</td>
              <td>${escapeHTML(doc.party_name)}</td>
              <td>${escapeHTML(doc.description)}</td>
              <td>${money(doc.net_amount)}</td>
              <td><span class="status ${escapeAttr(doc.status)}">${statusLabel(doc.status)}</span></td>
              <td>${formatDateTime(doc.created_at)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderExpenseDraftHtml(item, index) {
  return `
    <div class="line-item" data-expense-index="${index}">
      <div class="form-grid four">
        <label>รายการ
          <input data-expense-field="description" value="${escapeAttr(item.description)}" placeholder="ค่าน้ำมัน / ทางด่วน" />
        </label>
        <label>ขา
          <select data-expense-field="leg">
            <option value="pickup" ${selected(item.leg, 'pickup')}>ขารับ</option>
            <option value="delivery" ${selected(item.leg, 'delivery')}>ขาส่ง</option>
            <option value="other" ${selected(item.leg, 'other')}>อื่น ๆ</option>
          </select>
        </label>
        <label>จำนวนเงิน
          <input data-expense-field="amount" data-expense-amount type="number" step="0.01" min="0" value="${escapeAttr(item.amount)}" />
        </label>
        <label>ผู้จ่าย
          <select data-expense-field="paid_by">
            <option value="company" ${selected(item.paid_by, 'company')}>บริษัท</option>
            <option value="driver" ${selected(item.paid_by, 'driver')}>พขร.</option>
            <option value="subcontractor" ${selected(item.paid_by, 'subcontractor')}>ผรม.</option>
            <option value="other" ${selected(item.paid_by, 'other')}>อื่น ๆ</option>
          </select>
        </label>
      </div>
      <div class="form-grid four">
        <label class="checkbox-line">
          <input data-expense-field="deduct_from_driver" data-expense-deduct type="checkbox" ${boolValue(item.deduct_from_driver) ? 'checked' : ''} />
          หัก พขร. / หัก ผรม.
        </label>
        <label>ยอดหัก
          <input data-expense-field="deduction_amount" data-expense-deduction type="number" step="0.01" min="0" value="${escapeAttr(item.deduction_amount)}" />
        </label>
        <label>ผู้รับเงิน
          <input data-expense-field="payee_name" value="${escapeAttr(item.payee_name)}" />
        </label>
        <button class="btn secondary small danger-text" data-remove-expense="${index}" type="button">ลบ</button>
      </div>
    </div>
  `;
}

function renderSpecialDraftHtml(item, index) {
  return `
    <div class="line-item" data-special-index="${index}">
      <div class="form-grid four">
        <label>รายการพิเศษ
          <input data-special-field="description" value="${escapeAttr(item.description)}" placeholder="ค่ารอโหลด / ค่ายกสินค้า" />
        </label>
        <label>ขา
          <select data-special-field="leg">
            <option value="pickup" ${selected(item.leg, 'pickup')}>ขารับ</option>
            <option value="delivery" ${selected(item.leg, 'delivery')}>ขาส่ง</option>
            <option value="other" ${selected(item.leg, 'other')}>อื่น ๆ</option>
          </select>
        </label>
        <label class="checkbox-line">
          <input data-special-field="bill_to_customer" type="checkbox" ${boolValue(item.bill_to_customer) ? 'checked' : ''} />
          เรียกเก็บลูกค้า
        </label>
        <label class="checkbox-line">
          <input data-special-field="payable_to_party" type="checkbox" ${boolValue(item.payable_to_party) ? 'checked' : ''} />
          ต้องจ่ายต่อ
        </label>
      </div>

      <div class="form-grid four sub-panel">
        <label>วิธีคิดราคารับ
          <select data-special-field="customer_charge_calc_type">
            <option value="fixed" ${selected(item.customer_charge_calc_type, 'fixed')}>บาท</option>
            <option value="percent" ${selected(item.customer_charge_calc_type, 'percent')}>%</option>
          </select>
        </label>
        <label>ราคารับ / %
          <input data-special-field="customer_charge_rate" type="number" step="0.01" min="0" value="${escapeAttr(item.customer_charge_rate)}" />
        </label>
        <label>WHT รับ %
          <input data-special-field="customer_wht_rate" type="number" step="0.01" min="0" value="${escapeAttr(item.customer_wht_rate)}" />
        </label>
        <label>VAT รับ %
          <input data-special-field="customer_vat_rate" type="number" step="0.01" min="0" value="${escapeAttr(item.customer_vat_rate)}" />
        </label>
      </div>

      <div class="form-grid four sub-panel">
        <label>วิธีคิดราคาจ่าย
          <select data-special-field="payable_calc_type">
            <option value="fixed" ${selected(item.payable_calc_type, 'fixed')}>บาท</option>
            <option value="percent" ${selected(item.payable_calc_type, 'percent')}>%</option>
          </select>
        </label>
        <label>ราคาจ่าย / %
          <input data-special-field="payable_rate" type="number" step="0.01" min="0" value="${escapeAttr(item.payable_rate)}" />
        </label>
        <label>WHT จ่าย %
          <input data-special-field="payable_wht_rate" type="number" step="0.01" min="0" value="${escapeAttr(item.payable_wht_rate)}" />
        </label>
        <label>VAT จ่าย %
          <input data-special-field="payable_vat_rate" type="number" step="0.01" min="0" value="${escapeAttr(item.payable_vat_rate)}" />
        </label>
      </div>

      <div class="form-grid four">
        <label>ผู้รับเงินฝั่งจ่าย
          <input data-special-field="payee_name" value="${escapeAttr(item.payee_name)}" />
        </label>
        <label>หมายเหตุ
          <input data-special-field="note" value="${escapeAttr(item.note)}" />
        </label>
        <button class="btn secondary small danger-text" data-remove-special="${index}" type="button">ลบ</button>
      </div>
    </div>
  `;
}

function collectDraftRowsFromDom(root) {
  const expenseRows = [...root.querySelectorAll('[data-expense-index]')];
  if (expenseRows.length) {
    draftExpenses = expenseRows.map((row) => {
      const item = {};
      row.querySelectorAll('[data-expense-field]').forEach((input) => {
        item[input.dataset.expenseField] = input.type === 'checkbox' ? input.checked : input.value;
      });
      item.amount = toNumber(item.amount);
      item.deduction_amount = boolValue(item.deduct_from_driver) ? toNumber(item.deduction_amount || item.amount) : 0;
      return item;
    });
  }

  const specialRows = [...root.querySelectorAll('[data-special-index]')];
  if (specialRows.length) {
    draftSpecials = specialRows.map((row) => {
      const item = {};
      row.querySelectorAll('[data-special-field]').forEach((input) => {
        item[input.dataset.specialField] = input.type === 'checkbox' ? input.checked : input.value;
      });
      return item;
    });
  }
}

function normalizeSpecialDraft(item, trip) {
  const baseFreight = toNumber(trip.freight_income_amount);
  const customerRate = toNumber(item.customer_charge_rate);
  const customerAmount = item.customer_charge_calc_type === 'percent'
    ? round2(baseFreight * customerRate / 100)
    : customerRate;

  const payableBase = customerAmount > 0 ? customerAmount : baseFreight;
  const payableRate = toNumber(item.payable_rate);
  const payableAmount = item.payable_calc_type === 'percent'
    ? round2(payableBase * payableRate / 100)
    : payableRate;

  return {
    id: item.id || makeId('SPC'),
    trip_run_id: trip.id || '',
    description: item.description || '',
    leg: item.leg || 'pickup',
    bill_to_customer: boolValue(item.bill_to_customer),
    customer_charge_calc_type: item.customer_charge_calc_type || 'fixed',
    customer_charge_rate: customerRate,
    customer_charge_amount: boolValue(item.bill_to_customer) ? customerAmount : 0,
    customer_wht_rate: toNumber(item.customer_wht_rate),
    customer_vat_rate: toNumber(item.customer_vat_rate),
    payable_to_party: boolValue(item.payable_to_party),
    payable_calc_type: item.payable_calc_type || 'fixed',
    payable_rate: payableRate,
    payable_amount: boolValue(item.payable_to_party) ? payableAmount : 0,
    payable_wht_rate: toNumber(item.payable_wht_rate),
    payable_vat_rate: toNumber(item.payable_vat_rate),
    payee_name: item.payee_name || '',
    note: item.note || '',
    billing_status: boolValue(item.bill_to_customer) ? 'pending' : '',
    payment_status: boolValue(item.payable_to_party) ? 'pending' : '',
    created_at: item.created_at || nowISO()
  };
}

function defaultExpenseDraft() {
  return {
    description: '',
    leg: 'pickup',
    amount: 0,
    paid_by: 'company',
    deduct_from_driver: false,
    deduction_amount: 0,
    payee_name: ''
  };
}

function defaultSpecialDraft() {
  return {
    description: '',
    leg: 'pickup',
    bill_to_customer: false,
    customer_charge_calc_type: 'fixed',
    customer_charge_rate: 0,
    customer_wht_rate: 0,
    customer_vat_rate: 0,
    payable_to_party: false,
    payable_calc_type: 'fixed',
    payable_rate: 0,
    payable_wht_rate: 0,
    payable_vat_rate: 0,
    payee_name: '',
    note: ''
  };
}

async function executeMutation(action, payload, localMutation, loadingMessage = 'กำลังบันทึก...') {
  if (isBusy) return false;
  setBusy(true, loadingMessage);
  try {
    if (hasRemoteConfig()) {
      await apiCall(action, payload);
      localMutation();
      saveLocalState();
    } else {
      localMutation();
      saveLocalState();
    }
    return true;
  } catch (error) {
    showToast(error.message || 'เกิดข้อผิดพลาด', 'error');
    return false;
  } finally {
    setBusy(false);
  }
}

async function apiCall(action, payload) {
  const config = getConfig();
  if (!config.apiUrl || !config.apiToken) {
    throw new Error('ยังไม่ได้ตั้งค่า Web App URL หรือ API Token');
  }

  const response = await fetch(config.apiUrl, {
    method: 'POST',
    redirect: 'follow',
    body: JSON.stringify({
      token: config.apiToken,
      action,
      payload: payload || {}
    })
  });

  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (error) {
    throw new Error(`API response ไม่ใช่ JSON: ${text.slice(0, 120)}`);
  }

  if (!json.ok) {
    throw new Error(json.error || 'API error');
  }

  return json;
}

async function loadRemoteData(showMessage, loadingMessage = 'กำลังโหลดข้อมูล...') {
  if (!hasRemoteConfig()) return;
  const shouldShowLoading = showMessage || Boolean(loadingMessage);
  if (shouldShowLoading) setBusy(true, loadingMessage);
  try {
    const result = await apiCall('listAll', {});
    mergeRemoteState(result.data);
    saveLocalState();
    if (showMessage) showToast('Sync สำเร็จ');
  } catch (error) {
    if (showMessage) showToast(error.message, 'error');
  } finally {
    if (shouldShowLoading) setBusy(false);
  }
}

function mergeRemoteState(data) {
  if (!data) return;
  const next = clone(DEFAULT_STATE);
  TABLES.forEach((table) => {
    next[table] = Array.isArray(data[table]) ? data[table] : [];
  });
  next.trip_runs = next.trip_runs.map(normalizeTripRecord);
  state = next;
}

function loadLocalState() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) {
    seedDemoData();
    return;
  }
  try {
    state = { ...clone(DEFAULT_STATE), ...JSON.parse(raw) };
    state.trip_runs = state.trip_runs.map(normalizeTripRecord);
  } catch (error) {
    state = clone(DEFAULT_STATE);
  }
}

function saveLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function seedDemoData() {
  state = clone(DEFAULT_STATE);

  const customer = {
    id: 'CUS-DEMO',
    name: 'บริษัท ตัวอย่างโลจิสติกส์ จำกัด',
    tax_id: '0105559999999',
    billing_address: 'กรุงเทพฯ',
    revenue_type: 'manual',
    credit_term_days: 30,
    default_wht_rate: 1,
    default_vat_rate: 0,
    is_active: true,
    created_at: nowISO(),
    updated_at: nowISO()
  };

  state.customers.push(customer);
  saveLocalState();
}

function getConfig() {
  try {
    return JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
  } catch (error) {
    return {};
  }
}

function hasRemoteConfig() {
  const config = getConfig();
  return Boolean(config.apiUrl && config.apiToken);
}

function getCustomer(id) {
  return state.customers.find((customer) => customer.id === id);
}

function getExpensesByTrip(tripId) {
  return state.trip_expenses.filter((item) => item.trip_run_id === tripId);
}

function getSpecialsByTrip(tripId) {
  return state.trip_special_items.filter((item) => item.trip_run_id === tripId);
}

function formToObject(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function optionsHtml(map) {
  return Object.entries(map)
    .map(([value, label]) => `<option value="${escapeAttr(value)}">${escapeHTML(label)}</option>`)
    .join('');
}

function selected(current, value) {
  return String(current) === String(value) ? 'selected' : '';
}

function statusLabel(status) {
  const labels = {
    draft: 'ร่าง',
    approved: 'อนุมัติแล้ว',
    pending: 'รอทำรายการ',
    documented: 'สร้างเอกสารแล้ว',
    issued: 'ออกเอกสารแล้ว'
  };
  return labels[status] || status || '-';
}

function settlementTypeLabel(type) {
  const labels = {
    trip_allowance: 'ค่าเที่ยว',
    deduction: 'รายการหัก',
    special_payable: 'ค่าพิเศษจ่าย',
    subcontractor_pay: 'ค่าจ้างรถร่วม'
  };
  return labels[type] || type;
}

function money(value) {
  return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' }).format(toNumber(value));
}

function formatPercent(value) {
  return `${toNumber(value).toLocaleString('th-TH')}%`;
}

function formatDate(value) {
  if (!value) return '-';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
    const [year, month, day] = String(value).split('-');
    return `${day}/${month}/${year}`;
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return [
    String(date.getDate()).padStart(2, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    date.getFullYear()
  ].join('/');
}

function formatTime(value) {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function formatDateTime(value) {
  if (!value) return '-';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${formatDate(date)} ${formatTime(date)}`;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function nowISO() {
  return new Date().toISOString();
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function round2(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}

function boolValue(value) {
  return value === true || value === 'true' || value === 'TRUE' || value === 1 || value === '1' || value === 'on';
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function nextRunningNo(prefix, number) {
  return `${prefix}-${String(number).padStart(5, '0')}`;
}

function el(tagName, className) {
  const element = document.createElement(tagName);
  if (className) element.className = className;
  return element;
}

function emptyStateHtml(title, description) {
  return `
    <div class="empty-state">
      <h3>${escapeHTML(title)}</h3>
    </div>
  `;
}


function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function setBusy(value, message = 'กำลังโหลด...') {
  isBusy = value;
  document.body.classList.toggle('is-loading', value);
  if (loadingOverlay) {
    loadingOverlay.classList.toggle('show', value);
    loadingOverlay.setAttribute('aria-hidden', String(!value));
  }
  if (loadingText) loadingText.textContent = message;
  document.querySelectorAll('button, input, select, textarea').forEach((element) => {
    if (value) {
      element.setAttribute('aria-busy', 'true');
      element.setAttribute('disabled', 'disabled');
    } else {
      element.removeAttribute('aria-busy');
      element.removeAttribute('disabled');
    }
  });
}

function showToast(message, type = 'success') {
  toastEl.textContent = message;
  toastEl.className = `toast show ${type}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toastEl.className = 'toast';
  }, 3200);
}

function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(value) {
  return escapeHTML(value).replaceAll('`', '&#096;');
}
