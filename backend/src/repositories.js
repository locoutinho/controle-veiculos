import dayjs from "dayjs";
import { hashPassword, verifyPassword } from "./auth.js";
import { db } from "./db.js";

const userFields = `
  id, full_name AS fullName, username, role, status, created_at AS createdAt, updated_at AS updatedAt
`;

const vehicleFields = `
  v.id, v.plate, v.model, v.brand, v.year, v.owner_name AS ownerName, v.owner_user_id AS ownerUserId, v.status, v.notes,
  v.current_odometer AS currentOdometer, v.photo_url AS photoUrl, v.fuel_type AS fuelType,
  v.maintenance_due_date AS maintenanceDueDate, v.created_at AS createdAt, v.updated_at AS updatedAt,
  owner.full_name AS ownerFullName, owner.username AS ownerUsername
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
  t.owner_auto_checkout AS ownerAutoCheckout,
  t.owner_auto_checkout_reason AS ownerAutoCheckoutReason,
  t.returned_to_owner AS returnedToOwner,
  t.returned_to_owner_reason AS returnedToOwnerReason,
  t.returned_to_owner_at AS returnedToOwnerAt,
  u.full_name AS userFullName,
  u.username AS userUsername,
  ci.full_name AS checkedInByName,
  co.full_name AS checkedOutByName,
  v.plate AS vehiclePlate,
  v.model AS vehicleModel,
  v.brand AS vehicleBrand,
  v.owner_user_id AS vehicleOwnerUserId,
  owner.full_name AS vehicleOwnerName,
  owner.username AS vehicleOwnerUsername,
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

function todayBounds() {
  return {
    start: dayjs().startOf("day").format(),
    end: dayjs().endOf("day").format()
  };
}

function getSystemDefaultOwnerId() {
  return db.prepare(`
    SELECT id
    FROM users
    WHERE status = 'active'
    ORDER BY CASE WHEN role = 'admin' THEN 0 ELSE 1 END, id
    LIMIT 1
  `).get()?.id || null;
}

function getValidOwner(ownerUserId) {
  const owner = db.prepare(`
    SELECT id, full_name AS fullName, username, status
    FROM users
    WHERE id = ?
  `).get(ownerUserId);
  if (!owner) throw new Error("Selecione um proprietario valido para o veiculo.");
  if (owner.status !== "active") throw new Error("O proprietario do veiculo precisa ser um usuario ativo.");
  return owner;
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
    LEFT JOIN users owner ON owner.id = v.owner_user_id
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

function getTripWithDetailsById(tripId) {
  return db.prepare(`
    SELECT ${tripSelect}
    FROM trips t
    JOIN users u ON u.id = t.user_id
    JOIN users ci ON ci.id = t.checked_in_by_user_id
    LEFT JOIN users co ON co.id = t.checked_out_by_user_id
    JOIN vehicles v ON v.id = t.vehicle_id
    LEFT JOIN users owner ON owner.id = v.owner_user_id
    WHERE t.id = ?
  `).get(tripId);
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

export function getUserPreviewByUsername(username) {
  return db.prepare(`
    SELECT id, full_name AS fullName, username, role, status
    FROM users
    WHERE username = ?
  `).get(username);
}

export function createAccessLog({ userId = null, fullName = "", username, role = "", status, ipAddress = "", userAgent = "" }) {
  const result = db.prepare(`
    INSERT INTO access_logs (user_id, full_name_snapshot, username_snapshot, role_snapshot, status, ip_address, user_agent)
    VALUES (@userId, @fullName, @username, @role, @status, @ipAddress, @userAgent)
  `).run({
    userId,
    fullName,
    username,
    role,
    status,
    ipAddress,
    userAgent
  });
  return result.lastInsertRowid;
}

export function markAccessLogout(accessLogId) {
  if (!accessLogId) return;
  db.prepare(`
    UPDATE access_logs
    SET logout_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'success' AND logout_at IS NULL
  `).run(accessLogId);
}

export function listAccessLogs(filters = {}) {
  const clauses = [];
  const values = [];

  if (filters.userId) {
    clauses.push("COALESCE(a.user_id, 0) = ?");
    values.push(Number(filters.userId));
  }
  if (filters.status) {
    clauses.push("a.status = ?");
    values.push(filters.status);
  }
  if (filters.dateFrom) {
    clauses.push("datetime(a.attempted_at) >= datetime(?)");
    values.push(filters.dateFrom);
  }
  if (filters.dateTo) {
    clauses.push("datetime(a.attempted_at) <= datetime(?)");
    values.push(filters.dateTo + "T23:59:59");
  }

  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return db.prepare(`
    SELECT
      a.id,
      a.user_id AS userId,
      a.full_name_snapshot AS fullName,
      a.username_snapshot AS username,
      a.role_snapshot AS role,
      a.status,
      a.attempted_at AS attemptedAt,
      a.logout_at AS logoutAt,
      a.ip_address AS ipAddress,
      a.user_agent AS userAgent
    FROM access_logs a
    ${where}
    ORDER BY datetime(a.attempted_at) DESC
  `).all(...values);
}

export function getAccessLogSummary() {
  const { start, end } = todayBounds();
  const today = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) AS successCount,
      SUM(CASE WHEN status = 'failure' THEN 1 ELSE 0 END) AS failureCount
    FROM access_logs
    WHERE datetime(attempted_at) BETWEEN datetime(?) AND datetime(?)
  `).get(start, end);

  const lastSuccessful = db.prepare(`
    SELECT full_name_snapshot AS fullName, username_snapshot AS username, role_snapshot AS role, attempted_at AS attemptedAt
    FROM access_logs
    WHERE status = 'success'
    ORDER BY datetime(attempted_at) DESC
    LIMIT 1
  `).get();

  return {
    lastSuccessful,
    accessCountToday: today.successCount || 0,
    failedCountToday: today.failureCount || 0
  };
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
    LEFT JOIN users owner ON owner.id = v.owner_user_id
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
    LEFT JOIN users owner ON owner.id = v.owner_user_id
    WHERE t.status = 'open' ${scoped.clause}
    ORDER BY datetime(t.checked_in_at) DESC
    LIMIT 6
  `).all(...scoped.values);

  return {
    counts: { ...counts, activeUsers: activeUsers.activeUsers },
    summary,
    recentTrips,
    activeTrips,
    currentOpenTrip: getDetailedOpenTripByUser(currentUser.id),
    accessSummary: currentUser.role === "admin" ? getAccessLogSummary() : null
  };
}

export function listVehicles(includeInactive = true) {
  const where = includeInactive ? "" : "WHERE status != 'inactive'";
  return db.prepare(`
    SELECT ${vehicleFields}
    FROM vehicles v
    LEFT JOIN users owner ON owner.id = v.owner_user_id
    ${where.replace("status", "v.status")}
    ORDER BY v.model
  `).all();
}

export function getVehicleById(id) {
  const vehicle = db.prepare(`
    SELECT ${vehicleFields}
    FROM vehicles v
    LEFT JOIN users owner ON owner.id = v.owner_user_id
    WHERE v.id = ?
  `).get(id);
  if (!vehicle) return null;
  const recentTrips = db.prepare(`
    SELECT ${tripSelect}
    FROM trips t
    JOIN users u ON u.id = t.user_id
    JOIN users ci ON ci.id = t.checked_in_by_user_id
    LEFT JOIN users co ON co.id = t.checked_out_by_user_id
    JOIN vehicles v ON v.id = t.vehicle_id
    LEFT JOIN users owner ON owner.id = v.owner_user_id
    WHERE t.vehicle_id = ?
    ORDER BY datetime(t.checked_in_at) DESC
    LIMIT 8
  `).all(id);
  return { ...vehicle, recentTrips };
}

export function createVehicle(actorUserId, data) {
  const owner = getValidOwner(data.ownerUserId);
  const result = db.prepare(`
    INSERT INTO vehicles (plate, model, brand, year, owner_name, owner_user_id, status, notes, current_odometer, photo_url, fuel_type, maintenance_due_date)
    VALUES (@plate, @model, @brand, @year, @ownerName, @ownerUserId, @status, @notes, @currentOdometer, @photoUrl, @fuelType, @maintenanceDueDate)
  `).run({
    plate: data.plate,
    model: data.model,
    brand: data.brand,
    year: Number(data.year),
    ownerName: owner.fullName,
    ownerUserId: Number(data.ownerUserId),
    status: data.status,
    notes: data.notes || "",
    currentOdometer: Number(data.currentOdometer || 0),
    photoUrl: data.photoUrl || "",
    fuelType: data.fuelType || "",
    maintenanceDueDate: data.maintenanceDueDate || ""
  });
  logAudit(actorUserId, "create_vehicle", "vehicle", result.lastInsertRowid, `Veiculo ${data.plate} cadastrado para ${owner.fullName}.`);
  return getVehicleById(result.lastInsertRowid);
}

export function updateVehicle(actorUserId, id, data) {
  const owner = getValidOwner(data.ownerUserId);
  db.prepare(`
    UPDATE vehicles
    SET plate = @plate, model = @model, brand = @brand, year = @year, owner_name = @ownerName, owner_user_id = @ownerUserId,
        status = @status, notes = @notes, current_odometer = @currentOdometer, photo_url = @photoUrl,
        fuel_type = @fuelType, maintenance_due_date = @maintenanceDueDate, updated_at = CURRENT_TIMESTAMP
    WHERE id = @id
  `).run({
    id,
    plate: data.plate,
    model: data.model,
    brand: data.brand,
    year: Number(data.year),
    ownerName: owner.fullName,
    ownerUserId: Number(data.ownerUserId),
    status: data.status,
    notes: data.notes || "",
    currentOdometer: Number(data.currentOdometer || 0),
    photoUrl: data.photoUrl || "",
    fuelType: data.fuelType || "",
    maintenanceDueDate: data.maintenanceDueDate || ""
  });
  logAudit(actorUserId, "update_vehicle", "vehicle", id, `Veiculo ${data.plate} atualizado. Proprietario: ${owner.fullName}.`);
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
    LEFT JOIN users owner ON owner.id = v.owner_user_id
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
    LEFT JOIN users owner ON owner.id = v.owner_user_id
    WHERE t.status = 'open' ${scoped.clause}
    ORDER BY datetime(t.checked_in_at) DESC
  `).all(...scoped.values);
}

export function checkinVehicle(actorUserId, data) {
  if (!data.vehicleId) throw new Error("Selecione um veiculo.");
  const userOpenTrip = getOpenTripByUser(actorUserId);
  if (userOpenTrip) throw new Error("Voce ja esta com um veiculo em uso. Faca o check-out antes de retirar outro.");

  const vehicle = db.prepare(`
    SELECT id, status, current_odometer AS currentOdometer, owner_user_id AS ownerUserId, owner_name AS ownerName
    FROM vehicles
    WHERE id = ?
  `).get(data.vehicleId);
  if (!vehicle) throw new Error("Veiculo nao encontrado.");
  if (vehicle.status === "maintenance") throw new Error("Este veiculo esta em manutencao.");
  if (vehicle.status === "inactive") throw new Error("Este veiculo esta inativo.");
  if (!vehicle.ownerUserId) {
    const defaultOwnerId = getSystemDefaultOwnerId();
    db.prepare(`UPDATE vehicles SET owner_user_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(defaultOwnerId, data.vehicleId);
    vehicle.ownerUserId = defaultOwnerId;
  }

  const vehicleOpenTrip = getOpenTripByVehicle(data.vehicleId);
  const transaction = db.transaction(() => {
    if (vehicleOpenTrip && vehicleOpenTrip.userId !== actorUserId) {
      if (vehicleOpenTrip.userId === vehicle.ownerUserId) {
        throw new Error("O proprietario esta usando este veiculo no momento. O sistema nao encerra automaticamente o uso do proprietario.");
      }
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

    if (Number(actorUserId) !== Number(vehicle.ownerUserId)) {
      db.prepare(`
        UPDATE trips
        SET owner_auto_checkout = 1,
            owner_auto_checkout_reason = @reason,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = @tripId
      `).run({
        tripId: result.lastInsertRowid,
        reason: "CHECK-OUT automatico por uso do veiculo por outro usuario."
      });
    }

    db.prepare(`UPDATE vehicles SET status = 'in_use', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(data.vehicleId);
    logAudit(actorUserId, "checkin_vehicle", "trip", result.lastInsertRowid, `CHECK-IN do veiculo ${data.vehicleId}.`);
    return result.lastInsertRowid;
  });

  const tripId = transaction();
  return getTripWithDetailsById(tripId);
}

export function checkoutVehicle(actorUserId, data) {
  const trip = getDetailedOpenTripByUser(actorUserId);
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

  if (Number(actorUserId) !== Number(trip.vehicleOwnerUserId)) {
    db.prepare(`
      UPDATE trips
      SET returned_to_owner = 1,
          returned_to_owner_reason = @reason,
          returned_to_owner_at = @returnedToOwnerAt,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = @tripId
    `).run({
      tripId: trip.id,
      reason: "Retorno automatico ao proprietario. Veiculo ficou disponivel para novas retiradas.",
      returnedToOwnerAt: dayjs().format()
    });
    logAudit(actorUserId, "return_to_owner", "trip", trip.id, `Veiculo ${trip.vehiclePlate} retornou automaticamente ao proprietario ${trip.vehicleOwnerName}.`);
  }

  return getTripWithDetailsById(trip.id);
}

export function deleteTripHistory(actorUserId, tripId) {
  const trip = getTripWithDetailsById(tripId);
  if (!trip) throw new Error("Registro de historico nao encontrado.");
  if (trip.status === "open") throw new Error("Nao e possivel excluir uma utilizacao que ainda esta em aberto.");
  db.prepare(`DELETE FROM trips WHERE id = ?`).run(tripId);
  logAudit(actorUserId, "delete_trip_history", "trip", tripId, `Historico do veiculo ${trip.vehiclePlate} excluido pelo administrador.`);
}

export function getReferenceData(currentUser) {
  const settings = mapSettings(getSettingsRow());
  return {
    session: currentUser,
    settings,
    vehicles: listVehicles(currentUser.role === "admin"),
    users: currentUser.role === "admin" ? listUsers().filter((user) => user.status === "active") : [],
    openTrips: listOpenTrips(currentUser),
    currentOpenTrip: getDetailedOpenTripByUser(currentUser.id)
  };
}
