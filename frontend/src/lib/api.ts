export const API_BASE = "/api";
export const WS_BASE = typeof window !== "undefined" ? `ws://${window.location.host}/ws` : "";

export async function fetchStats() {
  const res = await fetch(`${API_BASE}/stats`);
  return res.json();
}

export async function fetchActions() {
  const res = await fetch(`${API_BASE}/actions`);
  return res.json();
}

export async function fetchPlaybooks() {
  const res = await fetch(`${API_BASE}/playbooks`);
  return res.json();
}

export async function fetchAlerts(page = 0, limit = 10, query = "", severity = "", ip = "") {
  const params = new URLSearchParams({ skip: (page * limit).toString(), limit: limit.toString() });
  if (query) params.append("query", query);
  if (severity) params.append("severity", severity);
  if (ip) params.append("ip", ip);
  const res = await fetch(`${API_BASE}/alerts?${params}`);
  return res.json();
}

export async function fetchCases(page = 0, limit = 10, query = "", status = "", severity = "", ip = "") {
  const params = new URLSearchParams({ skip: (page * limit).toString(), limit: limit.toString() });
  if (query) params.append("query", query);
  if (status) params.append("status", status);
  if (severity) params.append("severity", severity);
  if (ip) params.append("ip", ip);
  const res = await fetch(`${API_BASE}/cases?${params}`);
  return res.json();
}

export async function fetchCorrelationGroups() {
  const res = await fetch(`${API_BASE}/correlation/groups`);
  return res.json();
}

export async function fetchCorrelationPatterns() {
  const res = await fetch(`${API_BASE}/correlation/patterns`);
  return res.json();
}

export async function acknowledgeCase(caseId: number) {
  const res = await fetch(`${API_BASE}/cases/${caseId}/acknowledge`, { method: "PUT" });
  if (!res.ok) throw new Error("Failed to acknowledge case");
  return res.json();
}

export async function closeCase(caseId: number) {
  const res = await fetch(`${API_BASE}/cases/${caseId}/close`, { method: "PUT" });
  if (!res.ok) throw new Error("Failed to close case");
  return res.json();
}

export async function runPlaybook(playbookId: string, payload: any) {
  const res = await fetch(`${API_BASE}/playbooks/${playbookId}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || "Execution failed");
  return data;
}
