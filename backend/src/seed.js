import dayjs from "dayjs";
import { fileURLToPath } from "url";
import { hashPassword } from "./auth.js";
import { db, resetDatabase } from "./db.js";

export function seedDatabase({ reset = false } = {}) {
  if (reset) {
    resetDatabase();
  }

  const userCount = db.prepare("SELECT COUNT(*) AS count FROM users").get().count;
  if (userCount > 0 && !reset) {
    return false;
  }

  const insertUser = db.prepare(`
    INSERT INTO users (full_name, username, password_hash, role, status)
    VALUES (@full_name, @username, @password_hash, @role, @status)
  `);

  const insertVehicle = db.prepare(`
    INSERT INTO vehicles (plate, model, brand, year, owner_name, status, notes, current_odometer, photo_url, fuel_type, maintenance_due_date)
    VALUES (@plate, @model, @brand, @year, @owner_name, @status, @notes, @current_odometer, @photo_url, @fuel_type, @maintenance_due_date)
  `);

  const insertTrip = db.prepare(`
    INSERT INTO trips (
      user_id, vehicle_id, checked_in_at, checked_out_at, checked_in_by_user_id, checked_out_by_user_id,
      start_odometer, end_odometer, destination, purpose, checkin_notes, checkout_notes,
      distance_traveled, usage_minutes, status, automatic_checkout, automatic_checkout_reason
    ) VALUES (
      @user_id, @vehicle_id, @checked_in_at, @checked_out_at, @checked_in_by_user_id, @checked_out_by_user_id,
      @start_odometer, @end_odometer, @destination, @purpose, @checkin_notes, @checkout_notes,
      @distance_traveled, @usage_minutes, @status, @automatic_checkout, @automatic_checkout_reason
    )
  `);

  insertUser.run({ full_name: "Administrador do Sistema", username: "admin", password_hash: hashPassword("admin123"), role: "admin", status: "active" });
  insertUser.run({ full_name: "Usuario Operacional", username: "usuario", password_hash: hashPassword("usuario123"), role: "user", status: "active" });
  insertUser.run({ full_name: "Usuario Inativo", username: "inativo", password_hash: hashPassword("inativo123"), role: "user", status: "inactive" });

  [
    {
      plate: "BRA2E19",
      model: "Strada Freedom",
      brand: "Fiat",
      year: 2023,
      owner_name: "Empresa Alfa",
      status: "available",
      notes: "Veiculo com documentos no porta-luvas.",
      current_odometer: 18450,
      photo_url: "",
      fuel_type: "Flex",
      maintenance_due_date: dayjs().add(45, "day").format("YYYY-MM-DD")
    },
    {
      plate: "QWE4T56",
      model: "Hilux SRX",
      brand: "Toyota",
      year: 2022,
      owner_name: "Empresa Alfa",
      status: "in_use",
      notes: "Conferir kit de ferramentas antes da devolucao.",
      current_odometer: 42690,
      photo_url: "",
      fuel_type: "Diesel",
      maintenance_due_date: dayjs().add(20, "day").format("YYYY-MM-DD")
    },
    {
      plate: "XYZ9K88",
      model: "Onix LT",
      brand: "Chevrolet",
      year: 2021,
      owner_name: "Locadora Parceira",
      status: "maintenance",
      notes: "Em manutencao preventiva.",
      current_odometer: 35120,
      photo_url: "",
      fuel_type: "Flex",
      maintenance_due_date: dayjs().add(5, "day").format("YYYY-MM-DD")
    },
    {
      plate: "HJK3M21",
      model: "Ranger XLS",
      brand: "Ford",
      year: 2024,
      owner_name: "Empresa Alfa",
      status: "available",
      notes: "Veiculo reserva para viagens longas.",
      current_odometer: 7840,
      photo_url: "",
      fuel_type: "Diesel",
      maintenance_due_date: dayjs().add(90, "day").format("YYYY-MM-DD")
    }
  ].forEach((vehicle) => insertVehicle.run(vehicle));

  insertTrip.run({
    user_id: 2,
    vehicle_id: 1,
    checked_in_at: dayjs().subtract(2, "day").hour(8).minute(30).format(),
    checked_out_at: dayjs().subtract(2, "day").hour(13).minute(15).format(),
    checked_in_by_user_id: 2,
    checked_out_by_user_id: 2,
    start_odometer: 18220,
    end_odometer: 18420,
    destination: "Filial Campinas",
    purpose: "Visita tecnica",
    checkin_notes: "Retirada sem ocorrencias.",
    checkout_notes: "Devolucao normal.",
    distance_traveled: 200,
    usage_minutes: 285,
    status: "closed",
    automatic_checkout: 0,
    automatic_checkout_reason: ""
  });

  insertTrip.run({
    user_id: 1,
    vehicle_id: 2,
    checked_in_at: dayjs().subtract(3, "hour").format(),
    checked_out_at: null,
    checked_in_by_user_id: 1,
    checked_out_by_user_id: null,
    start_odometer: 42540,
    end_odometer: null,
    destination: "Cliente Zona Sul",
    purpose: "Reuniao comercial",
    checkin_notes: "Usuario retirou o veiculo e ainda nao devolveu.",
    checkout_notes: "",
    distance_traveled: 0,
    usage_minutes: 0,
    status: "open",
    automatic_checkout: 0,
    automatic_checkout_reason: ""
  });

  db.prepare(`
    INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details)
    VALUES
      (1, 'create_user', 'user', 2, 'Usuario operacional criado por seed'),
      (1, 'create_vehicle', 'vehicle', 1, 'Veiculo inicial cadastrado')
  `).run();

  return true;
}

const isDirectRun = process.argv[1] === fileURLToPath(import.meta.url);

if (isDirectRun) {
  seedDatabase({ reset: true });
  console.log("Banco SQLite recriado com dados ficticios em backend/data/fleet.db");
}
