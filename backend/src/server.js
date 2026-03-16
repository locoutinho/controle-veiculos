import cors from "cors";
import express from "express";
import { signToken, verifyToken } from "./auth.js";
import { initializeDatabase } from "./db.js";
import { seedDatabase } from "./seed.js";
import {
  authenticateUser,
  changeOwnPassword,
  checkinVehicle,
  checkoutVehicle,
  createAccessLog,
  createUser,
  createVehicle,
  deleteTripHistory,
  getDashboardData,
  getReferenceData,
  getSettings,
  getUserPreviewByUsername,
  getUserById,
  getVehicleById,
  listAccessLogs,
  listAuditLogs,
  listTrips,
  listUsers,
  listVehicles,
  markAccessLogout,
  resetUserPassword,
  updateSettings,
  updateUser,
  updateVehicle
} from "./repositories.js";

initializeDatabase();
seedDatabase();

const app = express();
const PORT = process.env.PORT || 4000;
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

app.use(cors({
  origin: ALLOWED_ORIGIN === "*" ? true : ALLOWED_ORIGIN.split(",").map((item) => item.trim()),
  credentials: false
}));
app.use(express.json());

function getRequestMeta(req) {
  const forwarded = req.headers["x-forwarded-for"];
  const ipAddress = Array.isArray(forwarded) ? forwarded[0] : String(forwarded || req.ip || "").split(",")[0].trim();
  const userAgent = req.headers["user-agent"] || "";
  return { ipAddress, userAgent };
}

function authRequired(req, res, next) {
  try {
    const token = (req.headers.authorization || "").replace("Bearer ", "");
    const payload = verifyToken(token);
    const user = getUserById(payload.sub);
    if (!user || user.status !== "active") return res.status(401).json({ message: "Sessao invalida." });
    req.user = user;
    req.auth = payload;
    next();
  } catch {
    res.status(401).json({ message: "Acesso nao autorizado." });
  }
}

function adminRequired(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ message: "Acesso restrito a administradores." });
  next();
}

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.post("/api/auth/login", (req, res) => {
  const meta = getRequestMeta(req);
  try {
    const user = authenticateUser(req.body.username, req.body.password);
    const accessLogId = createAccessLog({
      userId: user.id,
      fullName: user.fullName,
      username: user.username,
      role: user.role,
      status: "success",
      ...meta
    });
    res.json({ token: signToken(user), user, accessLogId });
  } catch (error) {
    const preview = getUserPreviewByUsername(req.body.username);
    createAccessLog({
      userId: preview?.id || null,
      fullName: preview?.fullName || "",
      username: req.body.username || "desconhecido",
      role: preview?.role || "",
      status: "failure",
      ...meta
    });
    res.status(401).json({ message: error.message });
  }
});

app.get("/api/auth/me", authRequired, (req, res) => res.json({ user: req.user }));

app.post("/api/auth/logout", authRequired, (req, res) => {
  markAccessLogout(req.body.accessLogId || req.auth?.accessLogId);
  res.json({ ok: true });
});

app.post("/api/auth/change-password", authRequired, (req, res) => {
  try {
    changeOwnPassword(req.user.id, req.body.currentPassword, req.body.newPassword, req.body.passwordConfirmation);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get("/api/dashboard", authRequired, (req, res) => res.json(getDashboardData(req.user)));
app.get("/api/references", authRequired, (req, res) => res.json(getReferenceData(req.user)));
app.get("/api/vehicles", authRequired, (req, res) => res.json(listVehicles(req.user.role === "admin")));

app.get("/api/vehicles/:id", authRequired, (req, res) => {
  const vehicle = getVehicleById(req.params.id);
  if (!vehicle) return res.status(404).json({ message: "Veiculo nao encontrado." });
  if (req.user.role !== "admin" && vehicle.status === "inactive") return res.status(403).json({ message: "Acesso negado ao veiculo solicitado." });
  res.json(vehicle);
});

app.post("/api/vehicles", authRequired, adminRequired, (req, res) => {
  try {
    res.status(201).json(createVehicle(req.user.id, req.body));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.put("/api/vehicles/:id", authRequired, adminRequired, (req, res) => {
  try {
    res.json(updateVehicle(req.user.id, req.params.id, req.body));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get("/api/users", authRequired, adminRequired, (_req, res) => res.json(listUsers()));

app.post("/api/users", authRequired, adminRequired, (req, res) => {
  try {
    res.status(201).json(createUser(req.user.id, req.body));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.put("/api/users/:id", authRequired, adminRequired, (req, res) => {
  try {
    res.json(updateUser(req.user.id, req.params.id, req.body));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post("/api/users/:id/reset-password", authRequired, adminRequired, (req, res) => {
  try {
    resetUserPassword(req.user.id, req.params.id, req.body.password, req.body.passwordConfirmation);
    res.json({ ok: true });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get("/api/settings", authRequired, adminRequired, (_req, res) => res.json(getSettings()));

app.put("/api/settings", authRequired, adminRequired, (req, res) => {
  try {
    res.json(updateSettings(req.user.id, req.body));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.get("/api/audit-logs", authRequired, adminRequired, (_req, res) => res.json(listAuditLogs()));
app.get("/api/access-logs", authRequired, adminRequired, (req, res) => res.json(listAccessLogs(req.query)));
app.get("/api/trips", authRequired, (req, res) => res.json(listTrips(req.user, req.query)));
app.delete("/api/trips/:id", authRequired, adminRequired, (req, res) => {
  try {
    deleteTripHistory(req.user.id, req.params.id);
    res.status(204).send();
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post("/api/trips/checkin", authRequired, (req, res) => {
  try {
    res.status(201).json(checkinVehicle(req.user.id, req.body));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.post("/api/trips/checkout", authRequired, (req, res) => {
  try {
    res.json(checkoutVehicle(req.user.id, req.body));
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.use((error, _req, res, _next) => {
  res.status(500).json({ message: "Erro interno.", details: error.message });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
