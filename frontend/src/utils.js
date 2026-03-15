import dayjs from "dayjs";

export function formatDateTime(value) {
  if (!value) return "-";
  return dayjs(value).format("DD/MM/YYYY HH:mm");
}

export function formatDate(value) {
  if (!value) return "-";
  return dayjs(value).format("DD/MM/YYYY");
}

export function formatMinutes(value) {
  if (!value) return "0 min";
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  if (!hours) return `${minutes} min`;
  return `${hours}h ${minutes}min`;
}

export function vehicleStatusLabel(status) {
  return {
    available: "Disponivel",
    in_use: "Em uso",
    maintenance: "Manutencao"
  }[status] || status;
}

export function tripStatusLabel(status) {
  return status === "open" ? "Aberto" : "Fechado";
}
