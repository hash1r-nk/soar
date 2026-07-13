// ================================================
// YORU — Dashboard Logic
// Real-time WebSocket, Charts, Actions
// ================================================

const API = window.location.origin + "/api";

let alerts = [];
let cases = [];
let actions = [];
let playbooks = [];
let stats = {};
let correlationGroups = [];
let detectedPatterns = [];
let severityChart = null;
let caseChart = null;
let ws = null;
let wsReconnectTimer = null;

let activeCorrTab = 'groups';

// Pagination States
let alertState = { page: 0, limit: 10, total: 0, query: '', severity: '' };
let caseState = { page: 0, limit: 10, total: 0, query: '', status: '' };
let searchTimeout = null;


// ------------------------------------------------
// INITIALIZATION
// ------------------------------------------------

document.addEventListener("DOMContentLoaded", async () => {
    initCharts();
    await loadInitialData();
    connectWebSocket();
});

async function loadInitialData() {
    try {
        const [actionsRes, statsRes, corrGroupsRes, corrPatternsRes, playbooksRes] = await Promise.all([
            fetch(`${API}/actions`),
            fetch(`${API}/stats`),
            fetch(`${API}/correlation/groups`),
            fetch(`${API}/correlation/patterns`),
            fetch(`${API}/playbooks`),
        ]);

        actions = await actionsRes.json();
        playbooks = await playbooksRes.json();
        renderPlaybookSelect();
        stats = await statsRes.json();
        correlationGroups = await corrGroupsRes.json();
        detectedPatterns = await corrPatternsRes.json();

        await fetchAlerts();
        await fetchCases();

        renderActions();
        updateStats();
        updateCharts();
        renderCorrelationGroups();
        renderPatterns();
        renderTimeline();
        updateCorrelationStatusBar();
    } catch (err) {
        console.error("Failed to load initial data:", err);
        showToast("Error", "Could not connect to the SOAR backend", "❌");
    }
}

// ------------------------------------------------
// PAGINATION & FETCHING
// ------------------------------------------------

async function fetchAlerts() {
    try {
        const params = new URLSearchParams({
            skip: alertState.page * alertState.limit,
            limit: alertState.limit,
        });
        if (alertState.query) params.append('query', alertState.query);
        if (alertState.severity) params.append('severity', alertState.severity);

        const res = await fetch(`${API}/alerts?${params}`);
        const data = await res.json();
        alerts = data.items;
        alertState.total = data.total;
        renderAlerts();
        updateAlertPagination();
    } catch (err) { console.error("Error fetching alerts", err); }
}

async function fetchCases() {
    try {
        const params = new URLSearchParams({
            skip: caseState.page * caseState.limit,
            limit: caseState.limit,
        });
        if (caseState.query) params.append('query', caseState.query);
        if (caseState.status) params.append('status', caseState.status);

        const res = await fetch(`${API}/cases?${params}`);
        const data = await res.json();
        cases = data.items;
        caseState.total = data.total;
        renderCases();
        updateCasePagination();
    } catch (err) { console.error("Error fetching cases", err); }
}

function updateAlertPagination() {
    const totalPages = Math.ceil(alertState.total / alertState.limit) || 1;
    document.getElementById("alertsPageInfo").textContent = `Page ${alertState.page + 1} of ${totalPages}`;
    document.getElementById("prevAlerts").disabled = alertState.page === 0;
    document.getElementById("nextAlerts").disabled = alertState.page >= totalPages - 1;
}

function updateCasePagination() {
    const totalPages = Math.ceil(caseState.total / caseState.limit) || 1;
    document.getElementById("casesPageInfo").textContent = `Page ${caseState.page + 1} of ${totalPages}`;
    document.getElementById("prevCases").disabled = caseState.page === 0;
    document.getElementById("nextCases").disabled = caseState.page >= totalPages - 1;
}

function prevAlertPage() { if (alertState.page > 0) { alertState.page--; fetchAlerts(); } }
function nextAlertPage() { const totalPages = Math.ceil(alertState.total / alertState.limit); if (alertState.page < totalPages - 1) { alertState.page++; fetchAlerts(); } }
function prevCasePage() { if (caseState.page > 0) { caseState.page--; fetchCases(); } }
function nextCasePage() { const totalPages = Math.ceil(caseState.total / caseState.limit); if (caseState.page < totalPages - 1) { caseState.page++; fetchCases(); } }

function handleAlertSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        alertState.query = document.getElementById('alertSearch').value;
        alertState.page = 0;
        fetchAlerts();
    }, 300);
}

function handleAlertFilter() {
    alertState.severity = document.getElementById('alertSeverityFilter').value;
    alertState.page = 0;
    fetchAlerts();
}

function handleCaseSearch() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        caseState.query = document.getElementById('caseSearch').value;
        caseState.page = 0;
        fetchCases();
    }, 300);
}

function handleCaseFilter() {
    caseState.status = document.getElementById('caseStatusFilter').value;
    caseState.page = 0;
    fetchCases();
}


// ------------------------------------------------
// WEBSOCKET
// ------------------------------------------------

function connectWebSocket() {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        setConnectionStatus(true);
        if (wsReconnectTimer) {
            clearTimeout(wsReconnectTimer);
            wsReconnectTimer = null;
        }
        console.log("🟢 WebSocket connected");
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleWSMessage(msg);
    };

    ws.onclose = () => {
        setConnectionStatus(false);
        console.log("🔴 WebSocket disconnected, reconnecting in 3s...");
        wsReconnectTimer = setTimeout(connectWebSocket, 3000);
    };

    ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        ws.close();
    };
}

async function handleWSMessage(msg) {
    switch (msg.type) {
        case "new_alert":
            if (alertState.page === 0 && !alertState.query && !alertState.severity) {
                fetchAlerts();
            }
            showToast(
                "New Alert",
                `${msg.data.rule_name} — ${msg.data.severity}`,
                "🚨"
            );
            break;

        case "new_case":
            if (caseState.page === 0 && !caseState.query && !caseState.status) {
                fetchCases();
            }
            break;

        case "case_update":
            cases = cases.map(c => c.id === msg.data.id ? msg.data : c);
            renderCases();
            break;

        case "new_action":
            actions.push(msg.data);
            renderActions();
            showToast(
                "Action Executed",
                msg.data.result,
                msg.data.action_type === "block_ip" ? "🚫" : "📧"
            );
            break;

        case "stats_update":
            stats = msg.data;
            updateStats();
            updateCharts();
            updateCorrelationStatusBar();
            break;

        case "correlation_update":
            // Reload correlation groups
            try {
                const res = await fetch(`${API}/correlation/groups`);
                correlationGroups = await res.json();
                renderCorrelationGroups();
                renderTimeline();
                updateCorrelationStatusBar();
            } catch (e) { console.error("Failed to refresh correlation groups", e); }
            break;

        case "pattern_detected":
            detectedPatterns.unshift(msg.data);
            renderPatterns();
            renderTimeline();
            updateCorrelationStatusBar();
            showToast(
                "Pattern Detected",
                `${msg.data.patterns.map(p => patternLabel(p)).join(', ')} from ${msg.data.source_ip}`,
                "🧠"
            );
            break;
    }
}

function setConnectionStatus(connected) {
    const dot = document.getElementById("statusDot");
    const text = document.getElementById("statusText");

    if (connected) {
        dot.className = "status-dot connected";
        text.textContent = "Live";
    } else {
        dot.className = "status-dot disconnected";
        text.textContent = "Disconnected";
    }
}

// ------------------------------------------------
// RENDERING — ALERTS
// ------------------------------------------------

function renderAlerts() {
    const panel = document.getElementById("alertsPanel");
    const count = document.getElementById("alertCount");
    count.textContent = alertState.total || 0;

    if (alerts.length === 0) {
        panel.innerHTML = `
            <div class="panel-empty">
                <span class="icon">📡</span>
                <span>Waiting for Splunk alerts...</span>
                <span style="font-size:0.72rem;">Send a webhook to /api/ingest</span>
            </div>`;
        return;
    }

    // Show newest first
    const sorted = alerts;
    panel.innerHTML = sorted.map((a, i) => `
        <div class="alert-card ${i === 0 ? 'alert-new' : ''}" onclick="toggleAlertDetails('${a.id}')">
            <div class="alert-card-top">
                <div class="alert-card-title">${escapeHtml(a.rule_name)}</div>
                <span class="badge badge-${a.severity.toLowerCase()}">${a.severity}</span>
            </div>
            <div class="alert-card-meta">
                <span class="mono">🆔 ${a.id}</span>
                ${a.source_ip ? `<span>📤 <span class="mono">${a.source_ip}</span></span>` : ''}
                ${a.dest_ip ? `<span>📥 <span class="mono">${a.dest_ip}</span></span>` : ''}
                <span>🕐 ${formatTime(a.received_at)}</span>
            </div>
            ${a.description ? `<div class="alert-card-desc">${escapeHtml(a.description)}</div>` : ''}
            <div class="alert-card-details" id="details-${a.id}">
                ${a.event_id ? `<div class="detail-row"><span class="detail-label">Event ID</span><span class="detail-value mono">${a.event_id}</span></div>` : ''}
                ${a.search_name ? `<div class="detail-row"><span class="detail-label">Search Name</span><span class="detail-value">${escapeHtml(a.search_name)}</span></div>` : ''}
                ${a.results_link ? `<div class="detail-row"><span class="detail-label">Results Link</span><span class="detail-value"><a href="${a.results_link}" target="_blank" style="color:var(--accent-blue)">Open in Splunk ↗</a></span></div>` : ''}
                <div class="detail-row"><span class="detail-label">Status</span><span class="detail-value">${a.status}</span></div>
            </div>
        </div>
    `).join('');
}

function toggleAlertDetails(alertId) {
    const el = document.getElementById(`details-${alertId}`);
    if (el) {
        el.classList.toggle("visible");
    }
}

// ------------------------------------------------
// RENDERING — CASES
// ------------------------------------------------

function renderCases() {
    const panel = document.getElementById("casesPanel");
    const count = document.getElementById("caseCount");
    count.textContent = caseState.total || 0;

    if (cases.length === 0) {
        panel.innerHTML = `
            <div class="panel-empty">
                <span class="icon">📋</span>
                <span>No cases yet</span>
                <span style="font-size:0.72rem;">Cases are auto-created from alerts</span>
            </div>`;
        return;
    }

    // Show newest first
    const sorted = cases;
    panel.innerHTML = sorted.map(c => {
        const isClosed = c.status === "Closed";
        const isAcked = c.status === "Acknowledged";

        return `
            <div class="case-card">
                <div class="case-card-top">
                    <div>
                        <div class="case-card-title">${escapeHtml(c.title)}</div>
                        <div class="case-card-id mono">Case #${c.id} • ${c.type === 'correlated' ? '🔗 Correlated' : 'Alert ' + (c.alert_id || 'N/A')}</div>
                    </div>
                </div>
                <div class="case-card-info">
                    <span class="badge badge-${c.severity.toLowerCase()}">${c.severity}</span>
                    <span class="badge badge-${c.status.toLowerCase()}">${c.status}</span>
                    ${c.source_ip ? `<span style="font-size:0.75rem;color:var(--text-muted)">📤 <span class="mono">${c.source_ip}</span></span>` : ''}
                    ${c.dest_ip ? `<span style="font-size:0.75rem;color:var(--text-muted)">📥 <span class="mono">${c.dest_ip}</span></span>` : ''}
                </div>
                <div class="case-card-actions">
                    ${!isAcked && !isClosed ? `<button class="btn btn-purple" onclick="acknowledgeCase(${c.id})">✓ Acknowledge</button>` : ''}
                    ${!isClosed ? `<button class="btn btn-danger" onclick="closeCase(${c.id})">✕ Close</button>` : ''}
                    ${!isClosed ? `<button class="btn btn-success" onclick="quickBlockIP(${c.id}, '${c.source_ip || ''}')">🚫 Block IP</button>` : ''}
                    ${isClosed ? `<span style="font-size:0.75rem;color:var(--text-muted);">Resolved</span>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// ------------------------------------------------
// RENDERING — ACTIONS
// ------------------------------------------------

function renderActions() {
    const panel = document.getElementById("actionsPanel");
    const count = document.getElementById("actionCount");
    count.textContent = actions.length;

    if (actions.length === 0) {
        panel.innerHTML = `
            <div class="panel-empty">
                <span class="icon">📜</span>
                <span>No actions executed yet</span>
            </div>`;
        return;
    }

    const sorted = [...actions].reverse();
    panel.innerHTML = sorted.map(a => {
        // FIX: action_type is stored as "Playbook: Block IP via iptables", not "block_ip".
        // Check by substring so both the old and new format work.
        const isBlock = a.action_type.toLowerCase().includes('block');
        return `
        <div class="action-log-item">
            <div class="action-icon ${isBlock ? 'block' : 'notify'}">
                ${isBlock ? '🚫' : '📧'}
            </div>
            <div class="action-log-content">
                <div class="action-log-title">${isBlock ? 'IP Blocked' : 'Notification Sent'} — Case #${a.case_id}</div>
                <div class="action-log-result">${escapeHtml(a.result)}</div>
            </div>
            <div class="action-log-time">${formatTime(a.executed_at)}</div>
        </div>
    `;
    }).join('');
}

// ------------------------------------------------
// STATS
// ------------------------------------------------

function updateStats() {
    animateValue("statAlerts", stats.total_alerts || 0);
    animateValue("statOpenCases", stats.open_cases || 0);
    animateValue("statHighSev", (stats.high_severity || 0) + (stats.critical_severity || 0));
    animateValue("statActions", stats.total_actions || 0);

    // Sub-labels
    document.getElementById("statAlertsSub").textContent =
        stats.total_alerts ? `${stats.total_alerts} alert${stats.total_alerts !== 1 ? 's' : ''} received` : "No alerts received";

    document.getElementById("statOpenCasesSub").textContent =
        stats.open_cases ? `${stats.acknowledged_cases || 0} acknowledged` : "All clear";

    document.getElementById("statHighSevSub").textContent =
        `${stats.critical_severity || 0} critical, ${stats.high_severity || 0} high`;

    document.getElementById("statActionsSub").textContent =
        stats.total_actions ? `${stats.total_actions} action${stats.total_actions !== 1 ? 's' : ''} executed` : "No actions yet";

    // Correlation stat card
    animateValue("statCorrelation", stats.correlation_groups || 0);
    const patternsCount = stats.patterns_detected || 0;
    const dupesCount = stats.duplicates_blocked || 0;
    document.getElementById("statCorrelationSub").textContent =
        patternsCount || dupesCount
            ? `${patternsCount} pattern${patternsCount !== 1 ? 's' : ''}, ${dupesCount} dupes blocked`
            : "No correlations";
}

function animateValue(elementId, targetValue) {
    const el = document.getElementById(elementId);
    const current = parseInt(el.textContent) || 0;
    if (current === targetValue) return;

    const duration = 400;
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
        const value = Math.round(current + (targetValue - current) * eased);
        el.textContent = value;

        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }

    requestAnimationFrame(update);
}

// ------------------------------------------------
// CHARTS
// ------------------------------------------------

function initCharts() {
    // Severity donut chart
    const sevCtx = document.getElementById("severityChart").getContext("2d");
    severityChart = new Chart(sevCtx, {
        type: "doughnut",
        data: {
            labels: ["Critical", "High", "Medium", "Low"],
            datasets: [{
                data: [0, 0, 0, 0],
                backgroundColor: [
                    "rgba(239, 68, 68, 0.8)",
                    "rgba(249, 115, 22, 0.8)",
                    "rgba(234, 179, 8, 0.8)",
                    "rgba(34, 197, 94, 0.8)",
                ],
                borderColor: [
                    "rgba(239, 68, 68, 1)",
                    "rgba(249, 115, 22, 1)",
                    "rgba(234, 179, 8, 1)",
                    "rgba(34, 197, 94, 1)",
                ],
                borderWidth: 1,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: "65%",
            plugins: {
                legend: {
                    position: "right",
                    labels: {
                        color: "#94a3b8",
                        font: { family: "'Inter', sans-serif", size: 12 },
                        padding: 16,
                        usePointStyle: true,
                        pointStyleWidth: 10,
                    },
                },
            },
        },
    });

    // Case status bar chart
    const caseCtx = document.getElementById("caseChart").getContext("2d");
    caseChart = new Chart(caseCtx, {
        type: "bar",
        data: {
            labels: ["Open", "Acknowledged", "Closed"],
            datasets: [{
                label: "Cases",
                data: [0, 0, 0],
                backgroundColor: [
                    "rgba(59, 130, 246, 0.7)",
                    "rgba(168, 85, 247, 0.7)",
                    "rgba(100, 116, 139, 0.7)",
                ],
                borderColor: [
                    "rgba(59, 130, 246, 1)",
                    "rgba(168, 85, 247, 1)",
                    "rgba(100, 116, 139, 1)",
                ],
                borderWidth: 1,
                borderRadius: 6,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: "#64748b",
                        font: { family: "'Inter', sans-serif" },
                        stepSize: 1,
                    },
                    grid: { color: "rgba(99, 120, 180, 0.08)" },
                },
                x: {
                    ticks: {
                        color: "#94a3b8",
                        font: { family: "'Inter', sans-serif" },
                    },
                    grid: { display: false },
                },
            },
            plugins: {
                legend: { display: false },
            },
        },
    });
}

function updateCharts() {
    if (severityChart) {
        severityChart.data.datasets[0].data = [
            stats.critical_severity || 0,
            stats.high_severity || 0,
            stats.medium_severity || 0,
            stats.low_severity || 0,
        ];
        severityChart.update("none");
    }

    if (caseChart) {
        caseChart.data.datasets[0].data = [
            stats.open_cases || 0,
            stats.acknowledged_cases || 0,
            stats.closed_cases || 0,
        ];
        caseChart.update("none");
    }
}

// ------------------------------------------------
// CASE ACTIONS
// ------------------------------------------------

async function acknowledgeCase(caseId) {
    try {
        await fetch(`${API}/cases/${caseId}/acknowledge`, { method: "PUT" });
    } catch (err) {
        console.error("Failed to acknowledge case:", err);
        showToast("Error", "Could not acknowledge case", "❌");
    }
}

async function closeCase(caseId) {
    try {
        await fetch(`${API}/cases/${caseId}/close`, { method: "PUT" });
    } catch (err) {
        console.error("Failed to close case:", err);
        showToast("Error", "Could not close case", "❌");
    }
}

function quickBlockIP(caseId, ip) {
    document.getElementById("actionType").value = "block_ip";
    document.getElementById("actionCaseId").value = caseId;
    document.getElementById("actionTarget").value = ip;
    document.getElementById("actionNotes").value = "";

    // Scroll to actions
    document.querySelector(".actions-section").scrollIntoView({ behavior: "smooth" });
}

// ------------------------------------------------
// RUN AUTOMATED ACTION
// ------------------------------------------------


function renderPlaybookSelect() {
    const select = document.getElementById("playbookSelect");
    select.innerHTML = "";
    if (playbooks.length === 0) {
        select.innerHTML = '<option value="">No playbooks found</option>';
        return;
    }
    playbooks.forEach(pb => {
        const option = document.createElement("option");
        option.value = pb.id;
        option.textContent = `⚡ ${pb.name} — ${pb.description}`;
        select.appendChild(option);
    });
}

async function runPlaybook() {
    const playbookId = document.getElementById("playbookSelect").value;
    const caseId = document.getElementById("actionCaseId").value;
    const target = document.getElementById("actionTarget").value;
    const notes = document.getElementById("actionNotes").value;
    const btn = document.getElementById("runActionBtn");

    if (!playbookId || !caseId) {
        showToast("Error", "Please select a playbook and specify a Case ID", "❌");
        return;
    }

    btn.disabled = true;
    btn.textContent = "⏳ Running...";

    try {
        const res = await fetch(`${API}/playbooks/${playbookId}/run`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action_type: playbookId,
                case_id: parseInt(caseId),
                target: target,
                notes: notes
            })
        });

        const data = await res.json();
        if (data.error) throw new Error(data.error);

        showToast("Playbook Executed", "The playbook ran successfully.", "✅");
        
        document.getElementById("actionCaseId").value = "";
        document.getElementById("actionTarget").value = "";
        document.getElementById("actionNotes").value = "";

    } catch (err) {
        console.error("Action error", err);
        showToast("Execution Failed", err.message, "❌");
    } finally {
        btn.disabled = false;
        btn.textContent = "⚡ Execute Playbook";
    }
}


// ------------------------------------------------
// TOAST NOTIFICATIONS
// ------------------------------------------------

function showToast(title, message, icon = "ℹ️") {
    const container = document.getElementById("toastContainer");

    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `
        <span class="toast-icon">${icon}</span>
        <div class="toast-body">
            <div class="toast-title">${escapeHtml(title)}</div>
            <div class="toast-message">${escapeHtml(message)}</div>
        </div>
    `;

    container.appendChild(toast);

    // Auto-dismiss after 4 seconds
    setTimeout(() => {
        toast.classList.add("toast-out");
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

// ------------------------------------------------
// UTILITIES
// ------------------------------------------------

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTime(isoString) {
    if (!isoString) return '';
    try {
        const date = new Date(isoString);
        const now = new Date();
        const diffMs = now - date;
        const diffSec = Math.floor(diffMs / 1000);
        const diffMin = Math.floor(diffSec / 60);
        const diffHr = Math.floor(diffMin / 60);

        if (diffSec < 10) return 'just now';
        if (diffSec < 60) return `${diffSec}s ago`;
        if (diffMin < 60) return `${diffMin}m ago`;
        if (diffHr < 24) return `${diffHr}h ago`;

        return date.toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        });
    } catch {
        return isoString;
    }
}

// ------------------------------------------------
// CORRELATION ENGINE — RENDERING
// ------------------------------------------------

function patternLabel(pattern) {
    const labels = {
        "brute_force": "Brute Force",
        "port_scan": "Port Scan",
        "repeated_rule": "Repeated Rule",
    };
    return labels[pattern] || pattern;
}

function patternBadgeClass(pattern) {
    const classes = {
        "brute_force": "badge-brute-force",
        "port_scan": "badge-port-scan",
        "repeated_rule": "badge-repeated-rule",
    };
    return classes[pattern] || "badge-correlated";
}

function patternIcon(pattern) {
    const icons = {
        "brute_force": "🔨",
        "port_scan": "🔍",
        "repeated_rule": "🔁",
    };
    return icons[pattern] || "⚠️";
}

function switchCorrTab(tab) {
    activeCorrTab = tab;

    // Update tab buttons
    document.querySelectorAll('.corr-tab').forEach(btn => btn.classList.remove('active'));
    document.getElementById('tabGroups').classList.toggle('active', tab === 'groups');
    document.getElementById('tabPatterns').classList.toggle('active', tab === 'patterns');
    document.getElementById('tabTimeline').classList.toggle('active', tab === 'timeline');

    // Show/hide panels
    document.getElementById('corrGroupsPanel').style.display = tab === 'groups' ? '' : 'none';
    document.getElementById('corrPatternsPanel').style.display = tab === 'patterns' ? '' : 'none';
    document.getElementById('corrTimelinePanel').style.display = tab === 'timeline' ? '' : 'none';
}

function updateCorrelationStatusBar() {
    document.getElementById('corrGroups').textContent = stats.correlation_groups || 0;
    document.getElementById('corrPatterns').textContent = stats.patterns_detected || 0;
    document.getElementById('corrDupes').textContent = stats.duplicates_blocked || 0;
    document.getElementById('corrCases').textContent = stats.correlated_cases || 0;
}

function renderCorrelationGroups() {
    const panel = document.getElementById('corrGroupsPanel');

    if (!correlationGroups || correlationGroups.length === 0) {
        panel.innerHTML = `
            <div class="panel-empty">
                <span class="icon">🔍</span>
                <span>No correlation groups yet</span>
                <span style="font-size:0.72rem;">Groups form as alerts share source IPs</span>
            </div>`;
        return;
    }

    panel.innerHTML = correlationGroups.map((g, i) => {
        const patternBadges = (g.active_patterns || []).map(p =>
            `<span class="badge ${patternBadgeClass(p)}">${patternIcon(p)} ${patternLabel(p)}</span>`
        ).join('');

        const destIps = (g.dest_ips || []).filter(Boolean);
        const rules = (g.rules || []).filter(Boolean);

        return `
            <div class="corr-group-card ${i === 0 ? 'pattern-new' : ''}">
                <div class="corr-group-header">
                    <span class="corr-group-ip">📡 ${escapeHtml(g.source_ip)}</span>
                    <span class="corr-group-count">${g.alert_count} alert${g.alert_count !== 1 ? 's' : ''}</span>
                </div>
                <div class="corr-group-meta">
                    <span>🕐 First: ${formatTime(g.first_seen)}</span>
                    <span>🕐 Last: ${formatTime(g.last_seen)}</span>
                    ${destIps.length ? `<span>🎯 ${destIps.length} dest IP${destIps.length !== 1 ? 's' : ''}</span>` : ''}
                </div>
                ${patternBadges ? `<div class="corr-group-patterns">${patternBadges}</div>` : ''}
                ${rules.length ? `<div class="corr-group-rules"><strong>Rules:</strong> ${rules.map(r => escapeHtml(r)).join(', ')}</div>` : ''}
            </div>
        `;
    }).join('');
}

function renderPatterns() {
    const panel = document.getElementById('corrPatternsPanel');

    if (!detectedPatterns || detectedPatterns.length === 0) {
        panel.innerHTML = `
            <div class="panel-empty">
                <span class="icon">🧠</span>
                <span>No patterns detected</span>
                <span style="font-size:0.72rem;">Patterns are detected automatically from alert clusters</span>
            </div>`;
        return;
    }

    panel.innerHTML = detectedPatterns.map((p, i) => {
        const patternNames = (p.patterns || []).map(pt => patternLabel(pt)).join(', ');
        const icon = (p.patterns && p.patterns.length) ? patternIcon(p.patterns[0]) : '⚠️';

        return `
            <div class="pattern-item ${i === 0 ? 'pattern-new' : ''}">
                <div class="pattern-icon">${icon}</div>
                <div class="pattern-content">
                    <div class="pattern-title">${patternNames}</div>
                    <div class="pattern-detail">
                        <strong>Source:</strong> ${escapeHtml(p.source_ip)} ·
                        <strong>Alerts:</strong> ${p.alert_count} ·
                        <strong>Case:</strong> #${p.case_id}
                    </div>
                </div>
                <div class="pattern-time">${formatTime(p.detected_at)}</div>
            </div>
        `;
    }).join('');
}

function renderTimeline() {
    const panel = document.getElementById('corrTimelinePanel');

    // Build a combined timeline from alerts and pattern detections
    const events = [];

    alerts.forEach(a => {
        events.push({
            type: 'alert',
            time: a.received_at,
            title: a.rule_name,
            sub: `${a.source_ip || 'Unknown'} → ${a.dest_ip || '?'} · ${a.severity}`,
            id: a.id,
        });
    });

    detectedPatterns.forEach(p => {
        events.push({
            type: 'pattern',
            time: p.detected_at,
            title: (p.patterns || []).map(pt => patternLabel(pt)).join(', '),
            sub: `${p.source_ip} · ${p.alert_count} alerts · Case #${p.case_id}`,
            id: `pattern-${p.id}`,
        });
    });

    // Sort newest first
    events.sort((a, b) => new Date(b.time) - new Date(a.time));

    if (events.length === 0) {
        panel.innerHTML = `
            <div class="panel-empty">
                <span class="icon">⏱️</span>
                <span>No timeline data</span>
                <span style="font-size:0.72rem;">Timeline populates as alerts arrive</span>
            </div>`;
        return;
    }

    // Show max 50 events
    const limited = events.slice(0, 50);

    panel.innerHTML = limited.map(ev => `
        <div class="timeline-item">
            <div class="timeline-dot ${ev.type === 'pattern' ? 'pattern' : ''}"></div>
            <div class="timeline-content">
                <div class="timeline-title">${ev.type === 'pattern' ? '🧠 ' : '🚨 '}${escapeHtml(ev.title)}</div>
                <div class="timeline-sub">${escapeHtml(ev.sub)}</div>
            </div>
            <div class="timeline-time">${formatTime(ev.time)}</div>
        </div>
    `).join('');
}