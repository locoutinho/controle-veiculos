import dayjs from "dayjs";
import { hashPassword, verifyPassword } from "./auth.js";
import { db } from "./db.js";

const userFields = `
  id, full_name AS fullName, username, role, status, created_at AS createdAt, updated_at AS updatedAt
`;

const vehicleFields = `
  id, plate, model, brand, year, owner_name AS ownerName, status, notes,
  current_odometer AS currentOdometer, photo_url AS photoUrl, fuel_type AS fuelType,
  maintenance_due_date AS maintenanceDueDate, created_at AS createdAt, updated_at AS updatedAt
`;

const tripSelect = `
  t.id,
  t.user_id AS userId,
  t.vehicle_id AS vehicleId,
  t.checked_in_at AS checkedInAt,
  t.checked_out_at AS checkedOutAt,
  t.checked_in_by_user_id AS checkedInByUserId,
  t.checked_out_by_user_id AS checkedOutByUserId,
  t.start_odometer AS startOdometer,
  t.end_odometer AS endOdometer,
  t.destination,
  t.purpose,
  t.checkin_notes AS checkinNotes,
  t.checkout_notes AS checkoutNotes,
  t.distance_traveled AS distanceTraveled,
  t.usage_minutes AS usageMinutes,
  t.status,
  t.automatic_checkout AS automaticCheckout,
  t.automatic_checkout_reason AS automaticCheckoutReason,
  u.full_name AS userFullName,
  u.username AS userUsername,
  ci.full_name AS checkedInByName,
  co.full_name AS checkedOutByName,
  v.plate AS vehiclePlate,
  v.model AS vehicleModel,
  v.brand AS vehicleBrand,
  v.owner_name AS vehicleOwnerName,
  v.notes AS vehicleNotes
`;

function logAudit(actorUserId, action, entityType, entityId, details) {
  db.prepare(`
    INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details)
    VALUES (?, ?, ?, ?, ?)
  `).run(actorUserId || null, action, entityType, entityId || null, details || "");
}

function getSettingsRow() {
  return db.prepare(`
    SELECT id, company_name AS companyName, allow_user_full_history AS allowUserFullHistory,
           allow_user_dashboard_full AS allowUserDashboardFull, preferences_json AS preferencesJson,
           updated_at AS updatedAt
    FROM system_settings
    WHERE id = 1
  `).get();
}

function mapSettings(row) {
  return {
    ...row,
    allowUserFullHistory: Boolean(row.allowUserFullHistory),
    allowUserDashboardFull: Boolean(row.allowUserDashboardFull),
    preferences: JSON.parse(row.preferencesJson || "{}")
  };
}

function assertPasswordRules(password, confirmation) {
  if (!password || password.length < 6) throw new Error("A senha deve ter pelo menos 6 caracteres.");
  if (confirmation !== undefined && password !== confirmation) throw new Error("A confirmacao de senha nao confere.");
}

function historyWhereClause(currentUser) {
  const settings = mapSettings(getSettingsRow());
  if (currentUser.role === "admin" || settings.allowUserFullHistory) return { clause: "", values: [] };
  return { clause: " AND t.user_id = ?", values: [currentUser.id] };
}

function getOpenTripByUser(userId) {
  return db.prepare(`
    SELECT id, user_id AS userId, vehicle_id AS vehicleId, checked_in_at AS checkedInAt, start_odometer AS startOdometer
    FROM trips
    WHERE user_id = ? AND status = 'open'
  `).get(userId);
}

function getDetailedOpenTripByUser(userId) {
  return db.prepare(`
    SELECT ${tripSelect}
    FROM trips t
    JOIN users u ON u.id = t.user_id
    JOIN users ci ON ci.id = t.checked_in_by_user_id
    LEFT JOIN users co ON co.id = t.checked_out_by_user_id
    JOIN vehicles v ON v.id = t.vehicle_id
    WHERE t.user_id = ? AND t.status = 'open'
    ORDER BY datetime(t.checked_in_at) DESC
    LIMIT 1
  `).get(userId);
}

function getOpenTripByVehicle(vehicleId) {
  return db.prepare(`
    SELECT id, user_id AS userId, vehicle_id AS vehicleId, checked_in_at AS checkedInAt, start_odometer AS startOdometer
    FROM trips
    WHERE vehicle_id = ? AND status = 'open'
  `).get(vehicleId);
}

function closeTrip({ tripId, actorUserId, endOdometer, automatic, reason, checkoutNotes }) {
  const trip = db.prepare(`
    SELECT id, vehicle_id AS vehicleId, checked_in_at AS checkedInAt, start_odometer AS startOdometer
    FROM trips
    WHERE id = ?
  `).get(tripId);

  const checkedOutAt = dayjs().format();
  const finalOdometer = Number(endOdometer ?? trip.startOdometer);
  const distanceTraveled = Math.max(finalOdometer - Number(trip.startOdometer), 0);
  const usageMinutes = Math.max(dayjs(checkedOutAt).diff(dayjs(trip.checkedInAt), "minute"), 0);

  db.prepare(`
    UPDATE trips
    SET checked_out_at = @checkedOutAt,
        checked_out_by_user_id = @checkedOutByUserId,
        end_odometer = @endOdometer,
        checkout_notes = @checkoutNotes,
        distance_traveled = @distanceTraveled,
        usage_minutes = @usageMinutes,
        automatic_checkout = @automaticCheckout,
        automatic_checkout_reason = @automaticCheckoutReason,
        status = 'closed',
        updated_at = CURRENT_TIMESTAMP
    WHERE id = @tripId
  `).run({
    tripId,
    checkedOutAt,
    checkedOutByUserId: actorUserId,
    endOdometer: finalOdometer,
    checkoutNotes: checkoutNotes || "",
    distanceTraveled,
    usageMinutes,
    automaticCheckout: automatic ? 1 : 0,
    automaticCheckoutReason: reason || ""
  });

  db.prepare(`
    UPDATE vehicles
    SET status = 'available', current_odometer = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(finalOdometer, trip.vehicleId);

  logAudit(actorUserId, automatic ? "automatic_checkout" : "checkout_vehicle", "trip", tripId, reason || "Veiculo devolvido.");
}

export function authenticateUser(username, password) {
  const user = db.prepare(`
    SELECT id, full_name AS fullName, username, password_hash AS passwordHash, role, status
    FROM users
    WHERE username = ?
  `).get(username);

  if (!user || !verifyPassword(password, user.passwordHash)) throw new Error("Credenciais invalidas.");
  if (user.status !== "active") throw new Error("Usuario inativo. Contate o administrador.");
  return { id: user.id, fullName: user.fullName, username: user.username, role: user.role, status: user.status };
}

export function getUserById(id) {
  return db.prepare(`SELECT ${userFields} FROM users WHERE id = ?`).get(id);
}

export function listUsers() {
  return db.prepare(`SELECT ${userFields} FROM users ORDER BY full_name`).all();
}

export function createUser(actorUserId, data) {
  assertPasswordRules(data.password, data.passwordConfirmation);
  const result = db.prepare(`
    INSERT INTO users (full_name, username, password_hash, role, status)
    VALUES (@fullName, @username, @passwordHash, @role, @status)
  `).run({
    fullName: data.fullName,
    username: data.username,
    passwordHash: hashPassword(data.password),
    role: data.role,
    status: data.status
  });
  logAudit(actorUserId, "create_user", "user", result.lastInsertRowid, `Usuario ${data.username} criado.`);
  return getUserById(result.lastInsertRowid);
}

export function updateUser(actorUserId, id, data) {
  db.prepare(`
    UPDATE users
    SET full_name = @fullName, username = @username, role = @role, status = @status, updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({ id, fullName: data.fullName, username: data.username, role: data.role, status: data.status });
  logAudit(actorUserId, "update_user", "user", id, `Usuario ${data.username} atualizado.`);
  return getUserById(id);
}

export function resetUserPassword(actorUserId, id, password, confirmation) {
  assertPasswordRules(password, confirmation);
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(hashPassword(password), id);
  logAudit(actorUserId, "reset_password", "user", id, "Senha redefinida por administrador.");
}

export function changeOwnPassword(userId, currentPassword, newPassword, confirmation) {
  const user = db.prepare(`SELECT id, password_hash AS passwordHash FROM users WHERE id = ?`).get(userId);
  if (!user || !verifyPassword(currentPassword, user.passwordHash)) throw new Error("Senha atual invalida.");
  assertPasswordRules(newPassword, confirmation);
  db.prepare(`UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(hashPassword(newPassword), userId);
  logAudit(userId, "change_own_password", "user", userId, "Senha alterada pelo proprio usuario.");
}

export function getSettings() {
  const settings = mapSettings(getSettingsRow());
  const counts = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users) AS totalUsers,
      (SELECT COUNT(*) FROM users WHERE status = 'active') AS activeUsers,
      (SELECT COUNT(*) FROM vehicles) AS totalVehicles,
      (SELECT COUNT(*) FROM vehicles WHERE status != 'inactive') AS operationalVehicles
  `).get();
  return { settings, counts };
}

export function updateSettings(actorUserId, data) {
  db.prepare(`
    UPDATE system_settings
    SET company_name = @companyName,
        allow_user_full_history = @allowUserFullHistory,
        allow_user_dashboard_full = @allowUserDashboardFull,
        preferences_json = @preferencesJson,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `).run({
    companyName: data.companyName,
    allowUserFullHistory: data.allowUserFullHistory ? 1 : 0,
    allowUserDashboardFull: data.allowUserDashboardFull ? 1 : 0,
    preferencesJson: JSON.stringify(data.preferences || {})
  });
  logAudit(actorUserId, "update_settings", "system_settings", 1, "Configuracoes gerais alteradas.");
  return getSettings();
}

export function listAuditLogs() {
  return db.prepare(`
    SELECT a.id, a.action, a.entity_type AS entityType, a.entity_id AS entityId, a.details, a.created_at AS createdAt,
           u.full_name AS actorName, u.username AS actorUsername
    FROM audit_logs a
    LEFT JOIN users u ON u.id = a.actor_user_id
    ORDER BY datetime(a.created_at) DESC
    LIMIT 50
  `).all();
}

export function getDashboardData(currentUser) {
  const counts = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'available' THEN 1 ELSE 0 END) AS available,
      SUM(CASE WHEN status = 'in_use' THEN 1 ELSE 0 END) AS inUse,
      SUM(CASE WHEN status = 'maintenance' THEN 1 ELSE 0 END) AS maintenance,
      SUM(CASE WHEN status = 'inactive' THEN 1 ELSE 0 END) AS inactive
    FROM vehicles
  `).get();

  const activeUsers = db.prepare(`SELECT COUNT(*) AS activeUsers FROM users WHERE status = 'active'`).get();
  const scoped = historyWhereClause(currentUser);

  const summary = db.prepare(`
    SELECT COUNT(*) AS totalTrips,
           SUM(CASE WHEN status = 'open' THEN 1 ELSE 0 END) AS openTrips,
           SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closedTrips,
           SUM(CASE WHEN status = 'closed' THEN distance_traveled ELSE 0 END) AS totalDistance
    FROM trips t
    WHERE 1 = 1 ${scoped.clause}
  `).get(...scoped.values);

  const recentTrips = db.prepare(`
    SELECT ${tripSelect}
    FROM trips t
    JOIN users u ON u.id = t.user_id
    JOIN users ci ON ci.id = t.checked_in_by_user_id
    LEFT JOIN users co ON co.id = t.checked_out_by_user_id
    JOIN vehicles v ON v.id = t.vehicle_id
    WHERE 1 = 1 ${scoped.clause}
    ORDER BY datetime(t.checked_in_at) DESC
    LIMIT 8
  `).all(...scoped.values);

  const activeTrips = db.prepare(`
    SELECT ${tripSelect}
    FROM trips t
    JOIN users u ON u.id = t.user_id
    JOIN users ci ON ci.id = t.checked_in_by_user_id
    LEFT JOIN users co ON co.id = t.checked_out_by_user_id
    JOIN vehicles v ON v.id = t.vehicle_id
    WHERE t.status = 'open' ${scoped.clause}
    ORDER BY datetime(t.checked_in_at) DESC
    LIMIT 6
  `).all(...scoped.values);

  return { counts: { ...counts, activeUsers: activeUsers.activeUsers }, summary, recentTrips, activeTrips, currentOpenTrip: getDetailedOpenTripByUser(currentUser.id) };
}

export function listVehicles(includeInactive = true) {
  const where = includeInactive ? "" : "WHERE status != 'inactive'";
  return db.prepare(`SELECT ${vehicleFields} FROM vehicles ${where} ORDER BY model`).all();
}

export function getVehicleById(id) {
  const vehicle = db.prepare(`SELECT ${vehicleFields} FROM vehicles WHERE id = ?`).get(id);
  if (!vehicle) return null;
  const recentTrips = db.prepare(`
    SELECT ${tripSelect}
    FROM trips t
    JOIN users u ON u.id = t.user_id
    JOIN users ci ON ci.id = t.checked_in_by_user_id
    LEFT JOIN users co ON co.id = t.checked_out_by_user_id
    JOIN vehicles v ON v.id = t.vehicle_id
    WHERE t.vehicle_id = ?
    ORDER BY datetime(t.checked_in_at) DESC
    LIMIT 8
  `).all(id);
  return { ...vehicle, recentTrips };
}

export function createVehicle(actorUserId, data) {
  const result = db.prepare(`
    INSERT INTO vehicles (plate, model, brand, year, owner_name, status, notes, current_odometer, photo_url, fuel_type, maintenance_due_date)
    VALUES (@plate, @model, @brand, @year, @ownerName, @status, @notes, @currentOdometer, @photoUrl, @fuelType, @maintenanceDueDate)
  `).run({
    plate: data.plate,
    model: data.model,
    brand: data.brand,
    year: Number(data.year),
    ownerName: data.ownerName,
    status: data.status,
    notes: data.notes || "",
    currentOdometer: Number(data.currentOdometer || 0),
    photoUrl: data.photoUrl || "",
    fuelType: data.fuelType || "",
    maintenanceDueDate: data.maintenanceDueDate || ""
  });
  logAudit(actorUserId, "create_vehicle", "vehicle", result.lastInsertRowid, `Veiculo ${data.plate} cadastrado.`);
  return getVehicleById(result.lastInsertRowid);
}

export function updateVehicle(actorUserId, id, data) {
  db.prepare(`
    UPDATE vehicles
    SET plate = @plate, model = @model, brand = @brand, year = @year, owner_name = @ownerName,
        status = @status, notes = @notes, current_odometer = @currentOdometer, photo_url = @photoUrl,
        fuel_type = @fuelType, maintenance_due_date = @maintenanceDueDate, updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({
    id,
    plate: data.plate,
    model: data.model,
    brand: data.brand,
    year: Number(data.year),
    ownerName: data.ownerName,
    status: data.status,
    notes: data.notes || "",
    currentOdometer: Number(data.currentOdometer || 0),
    photoUrl: data.photoUrl || "",
    fuelType: data.fuelType || "",
    maintenanceDueDate: data.maintenanceDueDate || ""
  });
  logAudit(actorUserId, "update_vehicle", "vehicle", id, `Veiculo ${data.plate} atualizado.`);
  return getVehicleById(id);
}

export function listTrips(currentUser, filters = {}) {
  const clauses = [];
  const values = [];
  const scoped = historyWhereClause(currentUser);

  if (filters.vehicleId) { clauses.push("t.vehicle_id = ?"); values.push(filters.vehicleId); }
  if (filters.checkoutUserId) { clauses.push("t.user_id = ?"); values.push(filters.checkoutUserId); }
  if (filters.status) { clauses.push("t.status = ?"); values.push(filters.status); }
  if (filters.dateFrom) { clauses.push("date(t.checked_in_at) >= date(?)"); values.push(filters.dateFrom); }
  if (filters.dateTo) { clauses.push("date(t.checked_in_at) <= date(?)"); values.push(filters.dateTo); }

  const where = `WHERE 1 = 1 ${scoped.clause}${clauses.length ? ` AND ${clauses.join(" AND ")}` : ""}`;
  return db.prepare(`
    SELECT ${tripSelect}
    FROM trips t
    JOIN users u ON u.id = t.user_id
    JOIN users ci ON ci.id = t.checked_in_by_user_id
    LEFT JOIN users co ON co.id = t.checked_out_by_user_id
    JOIN vehicles v ON v.id = t.vehicle_id
    ${where}
    ORDER BY datetime(t.checked_in_at) DESC
  `).all(...scoped.values, ...values);
}

export function listOpenTrips(currentUser) {
  const scoped = historyWhereClause(currentUser);
  return db.prepare(`
    SELECT ${tripSelect}
    FROM trips t
    JOIN users u ON u.id = t.user_id
    JOIN users ci ON ci.id = t.checked_in_by_user_id
    LEFT JOIN users co ON co.id = t.checked_out_by_user_id
    JOIN vehicles v ON v.id = t.vehicle_id
    WHERE t.status = 'open' ${scoped.clause}
    ORDER BY datetime(t.checked_in_at) DESC
  `).all(...scoped.values);
}

export function checkinVehicle(actorUserId, data) {
  if (!data.vehicleId) throw new Error("Selecione um veiculo.");
  const userOpenTrip = getOpenTripByUser(actorUserId);
  if (userOpenTrip) throw new Error("Voce ja esta com um veiculo em uso. Faca o check-out antes de retirar outro.");

  const vehicle = db.prepare(`SELECT id, status, current_odometer AS currentOdometer FROM vehicles WHERE id = ?`).get(data.vehicleId);
  if (!vehicle) throw new Error("Veiculo nao encontrado.");
  if (vehicle.status === "maintenance") throw new Error("Este veiculo esta em manutencao.");
  if (vehicle.status === "inactive") throw new Error("Este veiculo esta inativo.");

  const vehicleOpenTrip = getOpenTripByVehicle(data.vehicleId);
  const transaction = db.transaction(() => {
    if (vehicleOpenTrip && vehicleOpenTrip.userId !== actorUserId) {
      closeTrip({
        tripId: vehicleOpenTrip.id,
        actorUserId,
        endOdometer: vehicle.currentOdometer,
        automatic: true,
        reason: "CHECK-OUT automatico realizado porque outro usuario iniciou uso do veiculo.",
        checkoutNotes: "CHECK-OUT automatico realizado porque outro usuario iniciou uso do veiculo."
      });
    }

    const result = db.prepare(`
      INSERT INTO trips (
        user_id, vehicle_id, checked_in_at, checked_in_by_user_id, start_odometer,
        destination, purpose, checkin_notes, status
      ) VALUES (
        @userId, @vehicleId, @checkedInAt, @checkedInByUserId, @startOdometer,
        '', '', @checkinNotes, 'open'
      )
    `).run({
      userId: actorUserId,
      vehicleId: data.vehicleId,
      checkedInAt: dayjs().format(),
      checkedInByUserId: actorUserId,
      startOdometer: Number(vehicle.currentOdometer || 0),
      checkinNotes: data.checkinNotes || ""
    });

    db.prepare(`UPDATE vehicles SET status = 'in_use', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(data.vehicleId);
    logAudit(actorUserId, "checkin_vehicle", "trip", result.lastInsertRowid, `CHECK-IN do veiculo ${data.vehicleId}.`);
    return result.lastInsertRowid;
  });

  const tripId = transaction();
  return db.prepare(`
    SELECT ${tripSelect}
    FROM trips t
    JOIN users u ON u.id = t.user_id
    JOIN users ci ON ci.id = t.checked_in_by_user_id
    LEFT JOIN users co ON co.id = t.checked_out_by_user_id
    JOIN vehicles v ON v.id = t.vehicle_id
    WHERE t.id = ?
  `).get(tripId);
}

export function checkoutVehicle(actorUserId, data) {
  const trip = getOpenTripByUser(actorUserId);
  if (!trip) throw new Error("Voce nao possui nenhum veiculo em uso para devolver.");

  const vehicle = db.prepare(`SELECT id, current_odometer AS currentOdometer FROM vehicles WHERE id = ?`).get(trip.vehicleId);
  const endOdometer = data.endOdometer === undefined || data.endOdometer === "" ? vehicle.currentOdometer : Number(data.endOdometer);
  if (Number.isNaN(endOdometer) || endOdometer < Number(trip.startOdometer)) {
    throw new Error("O km final nao pode ser menor que o km inicial.");
  }

  closeTrip({
    tripId: trip.id,
    actorUserId,
    endOdometer,
    automatic: false,
    reason: "",
    checkoutNotes: data.checkoutNotes || ""
  });

  return db.prepare(`
    SELECT ${tripSelect}
    FROM trips t
    JOIN users u ON u.id = t.user_id
    JOIN users ci ON ci.id = t.checked_in_by_user_id
    LEFT JOIN users co ON co.id = t.checked_out_by_user_id
    JOIN vehicles v ON v.id = t.vehicle_id
    WHERE t.id = ?
  `).get(trip.id);
}

export function getReferenceData(currentUser) {
  const settings = mapSettings(getSettingsRow());
  return {
    session: currentUser,
    settings,
    vehicles: listVehicles(currentUser.role === "admin"),
    users: currentUser.role === "admin" ? listUsers() : [],
    openTrips: listOpenTrips(currentUser),
    currentOpenTrip: getDetailedOpenTripByUser(currentUser.id)
  };
}
