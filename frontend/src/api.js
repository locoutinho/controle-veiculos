const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

function getToken() {
  const raw = localStorage.getItem("fleet-session");
  if (!raw) return "";
  try {
    return JSON.parse(raw).token || "";
  } catch {
    return "";
  }
}

async function request(path, options = {}) {
  const token = getToken();
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    },
    ...options
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Erro inesperado." }));
    throw new Error(error.message || "Erro inesperado.");
  }

  if (response.status === 204) return null;
  return response.json();
}

export const api = {
  login: (payload) => request("/auth/login", { method: "POST", body: JSON.stringify(payload) }),
  me: () => request("/auth/me"),
  changeOwnPassword: (payload) => request("/auth/change-password", { method: "POST", body: JSON.stringify(payload) }),
  getDashboard: () => request("/dashboard"),
  getReferences: () => request("/references"),
  getVehicles: () => request("/vehicles"),
  getVehicle: (id) => request(`/vehicles/${id}`),
  createVehicle: (payload) => request("/vehicles", { method: "POST", body: JSON.stringify(payload) }),
  updateVehicle: (id, payload) => request(`/vehicles/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  getUsers: () => request("/users"),
  createUser: (payload) => request("/users", { method: "POST", body: JSON.stringify(payload) }),
  updateUser: (id, payload) => request(`/users/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  resetUserPassword: (id, payload) => request(`/users/${id}/reset-password`, { method: "POST", body: JSON.stringify(payload) }),
  getSettings: () => request("/settings"),
  updateSettings: (payload) => request("/settings", { method: "PUT", body: JSON.stringify(payload) }),
  getAuditLogs: () => request("/audit-logs"),
  getTrips: (filters) => {
    const params = new URLSearchParams(
      Object.entries(filters || {}).filter(([, value]) => value !== "" && value !== null && value !== undefined)
    );
    return request(`/trips?${params.toString()}`);
  },
  deleteTrip: (id) => request(`/trips/${id}`, { method: "DELETE" }),
  checkout: (payload) => request("/trips/checkout", { method: "POST", body: JSON.stringify(payload) }),
  checkin: (payload) => request("/trips/checkin", { method: "POST", body: JSON.stringify(payload) })
};
