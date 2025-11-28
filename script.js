// ----------------- State -----------------
let donationData = { total: 0, donors: 0, donations: [], categories: {} };
let trendChart = null, categoryChart = null;

// Virtual day config (always enabled)
const VIRTUAL_DAY_MS = 5 * 60 * 1000; // 5 minutes -> 1 virtual day
const virtualStartRealMs = Date.now();

// Chart scale config
const Y_AXIS_MAX = 100000;   // maximum on y axis
const Y_AXIS_STEP = 10000;   // tick interval

// ----------------- Virtual helpers -----------------
function getVirtualDaysElapsed() {
  return Math.floor((Date.now() - virtualStartRealMs) / VIRTUAL_DAY_MS);
}
function nowAdjusted() {
  const virtualDays = getVirtualDaysElapsed();
  return new Date(Date.now() + virtualDays * 24 * 3600 * 1000);
}

// ----------------- Date parsing / formatting -----------------
function parseDonationDate(d) {
  if (!d) return null;
  if (d.timestamp) {
    const dt = new Date(d.timestamp);
    if (!isNaN(dt)) return dt;
  }
  if (d.date && d.time) {
    const dt = new Date(`${d.date}T${d.time}`);
    if (!isNaN(dt)) return dt;
  }
  if (d.date) {
    const dt = new Date(d.date);
    if (!isNaN(dt)) return dt;
  }
  return null;
}
function fmtDateLabel(d) {
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}

// ----------------- Currency -----------------
function formatCurrencyFull(n) {
  try { return '$' + Number(n || 0).toLocaleString(); }
  catch (e) { return '$' + (n || 0); }
}

// ----------------- Aggregation using stable _virtualDate -----------------
function listDaysBetween(startDate, endDate) {
  const days = [];
  const cur = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
  const end = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());
  while (cur <= end) {
    days.push(new Date(cur.getFullYear(), cur.getMonth(), cur.getDate()));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function getDonationVirtualDate(d) {
  // Prefer stable client-side _virtualDate if present
  if (d && d._virtualDate) {
    const v = new Date(d._virtualDate);
    if (!isNaN(v)) return v;
  }
  // fallback: compute from raw timestamp shifted by current virtual days
  const raw = parseDonationDate(d);
  if (!raw) return null;
  const virtualDays = getVirtualDaysElapsed();
  return new Date(raw.getTime() + virtualDays * 24 * 3600 * 1000);
}

function aggregateByDate(startDate, endDate) {
  const days = listDaysBetween(startDate, endDate);
  const keys = days.map(d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`);
  const sums = new Array(keys.length).fill(0);

  donationData.donations.forEach(d => {
    const dt = getDonationVirtualDate(d);
    if (!dt) return;
    const key = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
    const idx = keys.indexOf(key);
    if (idx >= 0) sums[idx] += Number(d.amount) || 0;
  });

  const labels = days.map(fmtDateLabel);
  return { labels, sums, keys, days };
}

// ----------------- Donor counts & today's totals -----------------
function computeUniqueDonorsAll() {
  const s = new Set();
  (donationData.donations || []).forEach(d => {
    const n = (d.donor || '').toString().trim().toLowerCase();
    if (n) s.add(n);
  });
  return s.size;
}

function computeTodayTotal() {
  const today = nowAdjusted();
  let tot = 0;
  donationData.donations.forEach(d => {
    const dt = getDonationVirtualDate(d);
    if (!dt) return;
    if (dt.getFullYear() === today.getFullYear() && dt.getMonth() === today.getMonth() && dt.getDate() === today.getDate()) {
      tot += Number(d.amount) || 0;
    }
  });
  return tot;
}

// ----------------- 5-min window helpers using virtual date -----------------
function sumDonationsBetween(startDate, endDate) {
  let s = 0;
  donationData.donations.forEach(d => {
    const dt = getDonationVirtualDate(d);
    if (!dt) return;
    if (dt >= startDate && dt <= endDate) s += Number(d.amount) || 0;
  });
  return s;
}
function uniqueDonorsCountBetween(startDate, endDate) {
  const set = new Set();
  donationData.donations.forEach(d => {
    const dt = getDonationVirtualDate(d);
    if (!dt) return;
    if (dt >= startDate && dt <= endDate) {
      const name = (d.donor || '').toString().trim().toLowerCase();
      if (name) set.add(name);
    }
  });
  return set.size;
}

// ----------------- Chart rendering (y range forced as requested) -----------------
function renderLineChartForRange(fromDate, toDate) {
  // ensure toDate is at least adjusted today
  const adjToday = new Date(nowAdjusted().getFullYear(), nowAdjusted().getMonth(), nowAdjusted().getDate());
  if (toDate.getTime() < adjToday.getTime()) toDate = adjToday;

  const ctx = document.getElementById('trendChart').getContext('2d');
  const { labels, sums } = aggregateByDate(fromDate, toDate);
  const data = Array.isArray(sums) ? sums.map(v => Number(v) || 0) : [];

  const finalLabels = (labels && labels.length) ? labels : [fmtDateLabel(fromDate)];
  const finalData = (data && data.length) ? data : [0];

  if (trendChart) { try { trendChart.destroy(); } catch (e) {} trendChart = null; }

  trendChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: finalLabels,
      datasets: [{
        label: 'Daily Donations ($)',
        data: finalData,
        fill: false,
        borderColor: '#3b82f6',
        backgroundColor: '#3b82f6',
        tension: 0.24,
        pointRadius: 5,
        pointHoverRadius: 8,
        borderWidth: 3
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: true,
          callbacks: {
            title: (items) => items[0].label || '',
            label: (ctx) => formatCurrencyFull(ctx.parsed.y || 0)
          }
        }
      },
      scales: {
        x: { ticks: { maxRotation: 0, autoSkip: true } },
        y: {
          beginAtZero: true,
          suggestedMax: Y_AXIS_MAX,
          ticks: {
            stepSize: Y_AXIS_STEP,
            callback: (v) => formatCurrencyFull(v)
          }
        }
      }
    }
  });
}

function renderCategoryChart() {
  const ctx = document.getElementById('categoryChart').getContext('2d');
  const labels = Object.keys(donationData.categories || {});
  const values = labels.map(l => donationData.categories[l] || 0);

  if (categoryChart) { try { categoryChart.destroy(); } catch (e) {} categoryChart = null; }

  categoryChart = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: ['#3b82f6','#10b981','#f59e0b','#8b5cf6'] }] },
    options: {
      plugins: {
        legend: { position: 'bottom' },
        tooltip: { callbacks: { label: (c) => `${c.label}: ${formatCurrencyFull(c.parsed || 0)}` } }
      }
    }
  });
}

// ----------------- UI update -----------------
function updateDashboardUI() {
  const todayDateEl = document.getElementById('today-date');
  if (todayDateEl) {
    const adj = nowAdjusted();
    todayDateEl.textContent = adj.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
  }

  donationData.donations = donationData.donations || [];
  donationData.donors = computeUniqueDonorsAll();
  document.getElementById('total-donors').textContent = donationData.donors;

  document.getElementById('total-donations').textContent = formatCurrencyFull(donationData.total || 0);

  const avg = donationData.donors > 0 ? (donationData.total / donationData.donors) : 0;
  document.getElementById('avg-donation').textContent = formatCurrencyFull(Math.round(avg));

  document.getElementById('today-donations').textContent = formatCurrencyFull(computeTodayTotal());

  renderCategoryChart();

  const tbody = document.getElementById('donations-table');
  tbody.innerHTML = donationData.donations.slice(0, 15).map(d => {
    const cls = `badge-${String((d.category||'')).toLowerCase()}`;
    const amountFull = formatCurrencyFull(d.amount || 0);
    return `<tr>
      <td>${d.donor || '-'}</td>
      <td class="amount">${amountFull}</td>
      <td><span class="badge ${cls}">${d.category || '-'}</span></td>
      <td>${d.date || '-'}</td>
      <td>${d.time || '-'}</td>
    </tr>`;
  }).join('');
}

// ----------------- 5-min trends -----------------
function computeTrendsFiveMinutes() {
  // use adjusted 'now' (virtual days applied)
  const now = nowAdjusted();
  const curEnd = now;
  const curStart = new Date(now.getTime() - 5 * 60 * 1000);
  const prevEnd = new Date(curStart.getTime() - 1);
  const prevStart = new Date(now.getTime() - 10 * 60 * 1000);

  const curSum = sumDonationsBetween(curStart, curEnd);
  const prevSum = sumDonationsBetween(prevStart, prevEnd);

  // compute percent safely
  let percentDisplay;
  if (prevSum === 0 && curSum === 0) {
    percentDisplay = 0;
  } else if (prevSum === 0 && curSum > 0) {
    // show NEW for first non-zero after zero
    percentDisplay = 'NEW';
  } else {
    // normal percent change (rounded)
    percentDisplay = Math.round(((curSum - prevSum) / prevSum) * 100);
  }

  const curDonors = uniqueDonorsCountBetween(curStart, curEnd);
  const prevDonors = uniqueDonorsCountBetween(prevStart, prevEnd);
  const donorDiff = curDonors - prevDonors;

  return { percentDisplay, donorDiff, curSum, prevSum, curDonors, prevDonors };
}


// ----------------- Networking: merge stable _virtualDate per donation -----------------
async function fetchAll() {
  try {
    const [donRes, statsRes, catRes] = await Promise.all([
      fetch('/api/donations'), fetch('/api/stats'), fetch('/api/categories')
    ]);
    const donJson = await donRes.json();
    const statsJson = await statsRes.json();
    const catJson = await catRes.json();

    // keep map of previously computed virtual dates by id so we don't lose them
    const oldMap = new Map();
    (donationData.donations || []).forEach(d => {
      if (d && d.id && d._virtualDate) oldMap.set(d.id, d._virtualDate);
    });

    const fetched = (donJson && donJson.success) ? donJson.donations : [];
    // virtualDays at fetch moment (used only to compute _virtualDate for NEW donations)
    const virtualDaysAtFetch = getVirtualDaysElapsed();
    const computed = fetched.map(d => {
      const amount = Number(d.amount || 0);
      const id = d.id;
      // preserve old _virtualDate if available, else compute and store
      let viso = oldMap.get(id) || null;
      if (!viso) {
        const raw = parseDonationDate(d);
        if (raw) {
          const vdate = new Date(raw.getTime() + virtualDaysAtFetch * 24 * 3600 * 1000);
          viso = vdate.toISOString();
        }
      }
      return { ...d, amount, _virtualDate: viso };
    });

    donationData.donations = computed;
    donationData.total = (statsJson && statsJson.success) ? Number(statsJson.stats.total_amount || 0) : (donationData.total || 0);
    donationData.categories = (catJson && catJson.success) ? catJson.categories : (donationData.categories || {});

    // update trends display
    const tr = computeTrendsFiveMinutes();
    const totalTrendEl = document.getElementById('total-trend');
    if (totalTrendEl) {
      if (tr.percentDisplay === 'NEW') {
        totalTrendEl.textContent = 'NEW';
        totalTrendEl.classList.add('trend-up');
        totalTrendEl.classList.remove('trend-down');
      } else {
        const val = Number(tr.percentDisplay) || 0;
        const sign = val > 0 ? '+' : (val < 0 ? '' : '+');
        totalTrendEl.textContent = `${sign}${val}%`;
        totalTrendEl.classList.toggle('trend-up', val >= 0);
        totalTrendEl.classList.toggle('trend-down', val < 0);
      }
    }
    const donorTrendEl = document.getElementById('donor-trend');
    if (donorTrendEl) {
      const dd = tr.donorDiff;
      const dSign = dd > 0 ? '+' : (dd < 0 ? '' : '+');
      donorTrendEl.textContent = `${dSign}${dd}`;
    }

    updateDashboardUI();
    applyCurrentRangeToChart();
  } catch (err) {
    console.error('fetchAll error', err);
  }
}

async function triggerSimulate() {
  try {
    const res = await fetch('/api/simulate', { method: 'POST' });
    const body = await res.json();
    if (body && body.success) {
      // re-fetch and that donation will get a stable _virtualDate at fetch time
      await fetchAll();
      const alert = document.getElementById('donation-alert');
      document.getElementById('alert-content').innerHTML = `<strong>${body.donation.donor}</strong> donated <strong class="amount">${formatCurrencyFull(body.donation.amount)}</strong> to ${body.donation.category}`;
      alert.classList.add('show');
      setTimeout(() => alert.classList.remove('show'), 3500);
    }
  } catch (err) { console.error('simulate error', err); }
}

// ----------------- Range Controls -----------------
function getDefaultRangeDays(n = 12) {
  const endAdj = nowAdjusted();
  const end = new Date(endAdj.getFullYear(), endAdj.getMonth(), endAdj.getDate());
  const start = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (n - 1));
  return { start, end };
}

function applyCurrentRangeToChart() {
  const fromInput = document.getElementById('from-date');
  const toInput = document.getElementById('to-date');
  const daysRange = document.getElementById('days-range');
  const preset = document.getElementById('preset-select');

  let fromDate = null, toDate = null;
  // adjusted virtual "today" (midnight of adjusted today)
  const adjToday = new Date(nowAdjusted().getFullYear(), nowAdjusted().getMonth(), nowAdjusted().getDate());

  if (fromInput.value && toInput.value) {
    fromDate = new Date(fromInput.value + 'T00:00:00');
    toDate = new Date(toInput.value + 'T00:00:00');
    // Ensure chart always includes adjusted today
    if (toDate.getTime() < adjToday.getTime()) {
      toDate = new Date(adjToday.getTime());
      if (fromDate.getTime() > toDate.getTime()) {
        fromDate = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() - 11);
        document.getElementById('from-date').value = fromDate.toISOString().slice(0,10);
      }
      document.getElementById('to-date').value = toDate.toISOString().slice(0,10);
    }
  } else {
    const numDays = Number(daysRange.value || preset.value || 12);
    const r = getDefaultRangeDays(numDays);
    fromDate = r.start;
    toDate = r.end;
    if (toDate.getTime() < adjToday.getTime()) toDate = adjToday;
    document.getElementById('from-date').value = fromDate.toISOString().slice(0,10);
    document.getElementById('to-date').value = toDate.toISOString().slice(0,10);
  }

  const maxSpanDays = 1460;
  const span = Math.floor((toDate - fromDate) / (24*3600*1000)) + 1;
  if (span > maxSpanDays) {
    fromDate = new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate() - (maxSpanDays - 1));
    document.getElementById('from-date').value = fromDate.toISOString().slice(0,10);
  }

  if (toDate < fromDate) toDate = new Date(fromDate.getTime());

  renderLineChartForRange(fromDate, toDate);
  document.getElementById('days-range-value').textContent = `${Math.floor((toDate - fromDate)/(24*3600*1000)) + 1}`;
}

function wireRangeControls() {
  document.getElementById('apply-range').addEventListener('click', applyCurrentRangeToChart);

  document.getElementById('preset-select').addEventListener('change', (e) => {
    const val = Number(e.target.value || 12);
    document.getElementById('days-range').value = val;
    const r = getDefaultRangeDays(val);
    document.getElementById('from-date').value = r.start.toISOString().slice(0,10);
    document.getElementById('to-date').value = r.end.toISOString().slice(0,10);
    applyCurrentRangeToChart();
  });

  document.getElementById('days-range').addEventListener('input', (e) => {
    document.getElementById('days-range-value').textContent = e.target.value;
  });

  document.getElementById('days-range').addEventListener('change', () => {
    const val = Number(document.getElementById('days-range').value || 12);
    const r = getDefaultRangeDays(val);
    document.getElementById('from-date').value = r.start.toISOString().slice(0,10);
    document.getElementById('to-date').value = r.end.toISOString().slice(0,10);
    applyCurrentRangeToChart();
  });
}

// ----------------- Bootstrap -----------------
window.addEventListener('load', async () => {
  const tctx = document.getElementById('trendChart').getContext('2d');
  const cctx = document.getElementById('categoryChart').getContext('2d');
  trendChart = new Chart(tctx, { type: 'line', data: { labels: [], datasets: [{ data: [] }] } });
  categoryChart = new Chart(cctx, { type: 'doughnut', data: { labels: [], datasets: [{ data: [] }] } });

  document.getElementById('days-range-value').textContent = document.getElementById('days-range').value;
  wireRangeControls();

  await fetchAll();
  const def = getDefaultRangeDays(12);
  document.getElementById('from-date').value = def.start.toISOString().slice(0,10);
  document.getElementById('to-date').value = def.end.toISOString().slice(0,10);
  applyCurrentRangeToChart();

  setInterval(fetchAll, 7000);
  setInterval(() => { triggerSimulate(); }, Math.floor(Math.random() * 7000) + 7000);
});
