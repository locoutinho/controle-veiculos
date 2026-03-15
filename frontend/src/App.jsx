import { useEffect, useMemo, useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom";
import {
  ArrowRight,
  CarFront,
  ClipboardList,
  Gauge,
  History,
  KeyRound,
  LogIn,
  LogOut,
  Eye,
  EyeOff,
  Search,
  Settings,
  ShieldCheck,
  Users,
  LayoutDashboard
} from "lucide-react";
import { api } from "./api";
import { formatDate, formatDateTime, formatMinutes, tripStatusLabel, vehicleStatusLabel } from "./utils";

const emptyVehicle = {
  ownerName: "",
  model: "",
  plate: "",
  brand: "",
  year: "",
  status: "available",
  notes: "",
  currentOdometer: "",
  photoUrl: "",
  fuelType: "",
  maintenanceDueDate: ""
};

const emptyDriver = { name: "", employeeId: "", department: "", phone: "" };
const emptyUser = { fullName: "", username: "", role: "user", status: "active", password: "", passwordConfirmation: "" };
const emptyCheckin = { vehicleId: "", checkinNotes: "" };
const emptyCheckout = { endOdometer: "", fuelLevelEnd: "", checkoutNotes: "" };

function App() {
  const [session, setSession] = useState(() => {
    const raw = localStorage.getItem("fleet-session");
    return raw ? JSON.parse(raw) : null;
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (session) localStorage.setItem("fleet-session", JSON.stringify(session));
    else localStorage.removeItem("fleet-session");
  }, [session]);

  useEffect(() => {
    if (!session?.token) {
      setHydrated(true);
      return;
    }
    api.me()
      .then((result) => {
        setSession((current) => ({ ...current, user: result.user }));
        setHydrated(true);
      })
      .catch(() => {
        setSession(null);
        setHydrated(true);
      });
  }, []);

  if (!hydrated) return <div className="flex min-h-screen items-center justify-center bg-slate-100 text-slate-500">Carregando sessao...</div>;
  if (!session?.token) return <LoginPage onLogin={setSession} />;
  return <AuthenticatedApp session={session} onLogout={() => setSession(null)} onSessionChange={setSession} />;
}

function ScrollToTop() {
  const location = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [location.pathname]);

  return null;
}

function LoginPage({ onLogin }) {
  const [form, setForm] = useState({ username: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      onLogin(await api.login(form));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(15,118,110,0.18),_transparent_40%),linear-gradient(180deg,_#f8fafc,_#dbeafe)] px-4 py-10">
      <div className="mx-auto flex min-h-[80vh] max-w-6xl items-center">
        <div className="grid w-full gap-8 overflow-hidden rounded-[32px] bg-white/85 shadow-panel backdrop-blur lg:grid-cols-[1.15fr_0.85fr]">
          <div className="flex flex-col justify-between bg-ink px-8 py-10 text-white sm:px-12">
            <div>
              <div className="mb-6 inline-flex rounded-full bg-white/10 px-4 py-2 text-sm font-medium">Controle profissional de frota</div>
              <h1 className="max-w-md text-4xl font-semibold leading-tight">Check-in, check-out, usuarios e auditoria em um unico sistema.</h1>
              <p className="mt-4 max-w-lg text-sm text-slate-300">Acesso por perfil, validacoes mais rigidas e operacao segura para uso interno.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <FeatureCard title="Perfis de acesso" text="Menus e rotas bloqueados por permissao." />
              <FeatureCard title="Auditoria" text="Registro de cadastros, alteracoes e operacoes." />
              <FeatureCard title="Fluxo seguro" text="Datas automaticas e validacoes no backend." />
            </div>
          </div>
          <div className="flex items-center px-6 py-10 sm:px-10">
            <form onSubmit={handleSubmit} className="w-full space-y-5">
              <div>
                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-mist px-4 py-2 text-sm font-medium text-accent">
                  <ShieldCheck size={16} />
                  Login interno
                </div>
                <h2 className="text-2xl font-semibold text-slate-900">Entrar no sistema</h2>
                <p className="mt-2 text-sm text-slate-500">Entre com seu usuario e senha para acessar o sistema.</p>
              </div>
              <Field label="Usuario" value={form.username} onChange={(value) => setForm((current) => ({ ...current, username: value }))} />
              <PasswordField label="Senha" value={form.password} onChange={(value) => setForm((current) => ({ ...current, password: value }))} showPassword={showPassword} onTogglePassword={() => setShowPassword((current) => !current)} />
              {error ? <Alert kind="error" message={error} /> : null}
              <button type="submit" disabled={loading} className="w-full rounded-2xl bg-ink px-4 py-3 font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400">
                {loading ? "Entrando..." : "Acessar"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

function AuthenticatedApp({ session, onLogout, onSessionChange }) {
  const isAdmin = session.user.role === "admin";
  const menu = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard, adminOnly: false },
    { to: "/checkin", label: "Retirar veiculo", icon: LogIn, adminOnly: false },
    { to: "/checkout", label: "Devolver veiculo", icon: LogOut, adminOnly: false },
    { to: "/historico", label: "Historico", icon: History, adminOnly: false },
    { to: "/minha-conta", label: "Minha conta", icon: KeyRound, adminOnly: false },
    { to: "/veiculos", label: "Veiculos", icon: CarFront, adminOnly: true },
    { to: "/usuarios", label: "Usuarios", icon: ShieldCheck, adminOnly: true },
    { to: "/configuracoes", label: "Configuracoes", icon: Settings, adminOnly: true }
  ].filter((item) => !item.adminOnly || isAdmin);

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="mx-auto flex max-w-[1650px] flex-col lg:min-h-screen lg:flex-row">
        <aside className="bg-ink px-5 py-6 text-white lg:w-80">
          <div className="mb-8">
            <p className="text-sm uppercase tracking-[0.25em] text-teal-300">Frota</p>
            <h1 className="mt-2 text-2xl font-semibold">Controle de Veiculos</h1>
          </div>
          <nav className="grid gap-2">
            {menu.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.to === "/"} className={({ isActive }) => `flex items-center gap-3 rounded-2xl px-4 py-3 transition ${isActive ? "bg-white text-ink" : "text-slate-300 hover:bg-white/10 hover:text-white"}`}>
                <item.icon size={18} />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="mt-8 rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-slate-300">
            <p className="font-medium text-white">{session.user.fullName}</p>
            <p>{session.user.role === "admin" ? "Administrador" : "Usuario comum"}</p>
            <p className="mt-1 text-xs text-slate-400">Sessao ativa</p>
            <button onClick={onLogout} className="mt-4 w-full rounded-2xl bg-white/10 px-3 py-2 text-white hover:bg-white/20">Sair</button>
          </div>
        </aside>
        <main className="flex-1 px-4 py-4 sm:px-6 sm:py-6">
          <ScrollToTop />
          <Routes>
            <Route path="/" element={<DashboardPage session={session} />} />
            <Route path="/checkin" element={<CheckinPage />} />
            <Route path="/checkout" element={<CheckoutPage />} />
            <Route path="/historico" element={<HistoryPage session={session} />} />
            <Route path="/minha-conta" element={<AccountPage session={session} onSessionChange={onSessionChange} />} />
            <Route path="/veiculos" element={<AdminRoute session={session}><VehiclesPage /></AdminRoute>} />
            <Route path="/veiculos/:id" element={<AdminRoute session={session}><VehicleDetailsPage /></AdminRoute>} />
            <Route path="/usuarios" element={<AdminRoute session={session}><UsersPage /></AdminRoute>} />
            <Route path="/configuracoes" element={<AdminRoute session={session}><SettingsPage session={session} onSessionChange={onSessionChange} /></AdminRoute>} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function AdminRoute({ session, children }) {
  const location = useLocation();
  if (session.user.role !== "admin") return <Navigate to="/" replace state={{ deniedFrom: location.pathname }} />;
  return children;
}

function DashboardPage({ session }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    api.getDashboard().then(setData).catch((err) => setError(err.message));
  }, []);

  return (
    <PageShell title="Dashboard" subtitle="Resumo operacional da frota, dos usuarios e das movimentacoes.">
      {error ? <Alert kind="error" message={error} /> : null}
      {!data ? <LoadingCard /> : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <MetricCard title="Disponiveis" value={data.counts.available || 0} accent="bg-emerald-500" icon={CarFront} />
            <MetricCard title="Em uso" value={data.counts.inUse || 0} accent="bg-amber-500" icon={Gauge} />
            <MetricCard title="Manutencao" value={data.counts.maintenance || 0} accent="bg-rose-500" icon={ClipboardList} />
            <MetricCard title="Usuarios ativos" value={data.counts.activeUsers || 0} accent="bg-sky-600" icon={Users} />
            <MetricCard title="KM registrados" value={data.summary.totalDistance || 0} accent="bg-indigo-600" icon={History} />
          </div>
          <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <Panel title="Acoes rapidas" subtitle="Acesso direto aos fluxos principais do sistema.">
              <div className="grid gap-3 sm:grid-cols-2">
                <ActionCard title="Retirar veiculo" text="Registrar o CHECK-IN de retirada com data automatica." buttonLabel="Abrir CHECK-IN" onClick={() => navigate("/checkin")} tone="bg-accent" />
                <ActionCard title="Devolver veiculo" text="Encerrar o uso em aberto com CHECK-OUT automatico de horario." buttonLabel="Abrir CHECK-OUT" onClick={() => navigate("/checkout")} tone="bg-amber-500" />
                <ActionCard title="Consultar historico" text="Pesquisar por veiculo, motorista ou usuario responsavel." buttonLabel="Abrir historico" onClick={() => navigate("/historico")} tone="bg-sky-600" />
                {session.user.role === "admin" ? <ActionCard title="Configuracoes" text="Permissoes, parametros e resumo administrativo." buttonLabel="Abrir configuracoes" onClick={() => navigate("/configuracoes")} tone="bg-ink" /> : null}
              </div>
            </Panel>
            <Panel title="Veiculos ativos agora" subtitle="Utilizacoes em aberto acompanhadas em tempo real.">
              <div className="space-y-3">
                {data.activeTrips.length === 0 ? <EmptyState text="Nenhum veiculo em uso neste momento." /> : data.activeTrips.map((trip) => <TripCard key={trip.id} trip={trip} />)}
              </div>
            </Panel>
          </div>
          <Panel title="Ultimas movimentacoes" subtitle="Resumo recente do historico operacional.">
            <TripsTable trips={data.recentTrips} showOperators={session.user.role === "admin"} />
          </Panel>
        </>
      )}
    </PageShell>
  );
}

function VehiclesPage() {
  const [vehicles, setVehicles] = useState([]);
  const [form, setForm] = useState(emptyVehicle);
  const [editingId, setEditingId] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();

  const load = () => api.getVehicles().then(setVehicles).catch((err) => setFeedback(err.message));
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => vehicles.filter((vehicle) => {
    const term = search.toLowerCase();
    return [vehicle.model, vehicle.brand, vehicle.plate, vehicle.status].some((item) => item.toLowerCase().includes(term));
  }), [vehicles, search]);

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      if (editingId) {
        await api.updateVehicle(editingId, form);
        setFeedback("Veiculo atualizado com sucesso.");
      } else {
        await api.createVehicle(form);
        setFeedback("Veiculo cadastrado com sucesso.");
      }
      setForm(emptyVehicle);
      setEditingId(null);
      load();
    } catch (err) {
      setFeedback(err.message);
    }
  }

  return (
    <PageShell title="Gestao de veiculos" subtitle="Cadastro, edicao, inativacao e acompanhamento do status da frota.">
      {feedback ? <Alert kind={feedback.includes("sucesso") ? "success" : "error"} message={feedback} /> : null}
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title={editingId ? "Editar veiculo" : "Novo veiculo"} subtitle="Somente administradores podem alterar ou inativar veiculos.">
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
            <Field label="Placa" value={form.plate} onChange={(value) => setForm((current) => ({ ...current, plate: value.toUpperCase() }))} />
            <Field label="Modelo" value={form.model} onChange={(value) => setForm((current) => ({ ...current, model: value }))} />
            <Field label="Marca" value={form.brand} onChange={(value) => setForm((current) => ({ ...current, brand: value }))} />
            <Field label="Ano" type="number" value={form.year} onChange={(value) => setForm((current) => ({ ...current, year: value }))} />
            <Field label="Proprietario" value={form.ownerName} onChange={(value) => setForm((current) => ({ ...current, ownerName: value }))} />
            <SelectField label="Status" value={form.status} onChange={(value) => setForm((current) => ({ ...current, status: value }))} options={[{ value: "available", label: "Disponivel" }, { value: "in_use", label: "Em uso" }, { value: "maintenance", label: "Manutencao" }, { value: "inactive", label: "Inativo" }]} />
            <Field label="KM atual" type="number" value={form.currentOdometer} onChange={(value) => setForm((current) => ({ ...current, currentOdometer: value }))} />
            <Field label="Combustivel" value={form.fuelType} onChange={(value) => setForm((current) => ({ ...current, fuelType: value }))} required={false} />
            <Field label="Proxima manutencao" type="date" value={form.maintenanceDueDate} onChange={(value) => setForm((current) => ({ ...current, maintenanceDueDate: value }))} required={false} />
            <TextArea label="Observacoes" value={form.notes} onChange={(value) => setForm((current) => ({ ...current, notes: value }))} className="md:col-span-2" />
            <div className="md:col-span-2 flex gap-3">
              <PrimaryButton type="submit">{editingId ? "Salvar alteracoes" : "Cadastrar veiculo"}</PrimaryButton>
              {editingId ? <SecondaryButton type="button" onClick={() => { setEditingId(null); setForm(emptyVehicle); }}>Cancelar</SecondaryButton> : null}
            </div>
          </form>
        </Panel>
        <Panel title="Frota cadastrada" subtitle="Clique para editar ou abrir detalhes administrativos.">
          <SearchField value={search} onChange={setSearch} placeholder="Buscar por modelo, placa, marca ou status" />
          <div className="space-y-3">
            {filtered.map((vehicle) => (
              <button key={vehicle.id} type="button" onClick={() => navigate(`/veiculos/${vehicle.id}`)} className="w-full rounded-3xl border border-slate-200 bg-white p-4 text-left hover:border-slate-300 hover:bg-slate-50">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">{vehicle.model}</div>
                    <div className="text-sm text-slate-500">{vehicle.brand} - {vehicle.plate}</div>
                  </div>
                  <StatusBadge status={vehicle.status}>{vehicleStatusLabel(vehicle.status)}</StatusBadge>
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-500">
                  <span>Ano {vehicle.year}</span>
                  <span>KM {vehicle.currentOdometer}</span>
                  <span>{vehicle.ownerName}</span>
                  <span>{vehicle.fuelType || "Sem combustivel"}</span>
                </div>
                <div className="mt-3 rounded-2xl bg-slate-50 p-3 text-sm text-slate-600">{vehicle.notes || "Sem observacoes do veiculo."}</div>
                <div className="mt-4">
                  <SecondaryButton type="button" onClick={(event) => {
                    event.stopPropagation();
                    setEditingId(vehicle.id);
                    setForm({
                      ownerName: vehicle.ownerName,
                      model: vehicle.model,
                      plate: vehicle.plate,
                      brand: vehicle.brand,
                      year: vehicle.year,
                      status: vehicle.status,
                      notes: vehicle.notes || "",
                      currentOdometer: vehicle.currentOdometer,
                      photoUrl: vehicle.photoUrl || "",
                      fuelType: vehicle.fuelType || "",
                      maintenanceDueDate: vehicle.maintenanceDueDate || ""
                    });
                  }}>Editar cadastro</SecondaryButton>
                </div>
              </button>
            ))}
          </div>
        </Panel>
      </div>
    </PageShell>
  );
}

function DriversPage() {
  const [drivers, setDrivers] = useState([]);
  const [form, setForm] = useState(emptyDriver);
  const [editingId, setEditingId] = useState(null);
  const [feedback, setFeedback] = useState("");
  const [search, setSearch] = useState("");

  const load = () => api.getDrivers().then(setDrivers).catch((err) => setFeedback(err.message));
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => drivers.filter((driver) => {
    const term = search.toLowerCase();
    return [driver.name, driver.employeeId, driver.department, driver.phone || ""].some((item) => item.toLowerCase().includes(term));
  }), [drivers, search]);

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      if (editingId) {
        await api.updateDriver(editingId, form);
        setFeedback("Motorista atualizado com sucesso.");
      } else {
        await api.createDriver(form);
        setFeedback("Motorista cadastrado com sucesso.");
      }
      setForm(emptyDriver);
      setEditingId(null);
      load();
    } catch (err) {
      setFeedback(err.message);
    }
  }

  return (
    <PageShell title="Motoristas" subtitle="Cadastro e manutencao dos motoristas disponiveis para operacao.">
      {feedback ? <Alert kind={feedback.includes("sucesso") ? "success" : "error"} message={feedback} /> : null}
      <div className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Panel title={editingId ? "Editar motorista" : "Novo motorista"} subtitle="Utilizado no check-out como responsavel pela conducao.">
          <form onSubmit={handleSubmit} className="grid gap-4">
            <Field label="Nome" value={form.name} onChange={(value) => setForm((current) => ({ ...current, name: value }))} />
            <Field label="Matricula / identificacao" value={form.employeeId} onChange={(value) => setForm((current) => ({ ...current, employeeId: value }))} />
            <Field label="Setor" value={form.department} onChange={(value) => setForm((current) => ({ ...current, department: value }))} />
            <Field label="Telefone" value={form.phone} onChange={(value) => setForm((current) => ({ ...current, phone: value }))} required={false} />
            <div className="flex gap-3">
              <PrimaryButton type="submit">{editingId ? "Salvar alteracoes" : "Cadastrar motorista"}</PrimaryButton>
              {editingId ? <SecondaryButton type="button" onClick={() => { setEditingId(null); setForm(emptyDriver); }}>Cancelar</SecondaryButton> : null}
            </div>
          </form>
        </Panel>
        <Panel title="Lista de motoristas" subtitle="Gestao completa disponivel apenas para administradores.">
          <SearchField value={search} onChange={setSearch} placeholder="Buscar por nome, matricula, setor ou telefone" />
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr><th className="pb-3 font-medium">Nome</th><th className="pb-3 font-medium">Matricula</th><th className="pb-3 font-medium">Setor</th><th className="pb-3 font-medium">Telefone</th><th className="pb-3 font-medium">Acoes</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((driver) => (
                  <tr key={driver.id}>
                    <td className="py-3 font-medium text-slate-900">{driver.name}</td>
                    <td className="py-3">{driver.employeeId}</td>
                    <td className="py-3">{driver.department}</td>
                    <td className="py-3">{driver.phone}</td>
                    <td className="py-3"><SecondaryButton type="button" onClick={() => { setEditingId(driver.id); setForm({ name: driver.name, employeeId: driver.employeeId, department: driver.department, phone: driver.phone || "" }); }}>Editar</SecondaryButton></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </PageShell>
  );
}

function UsersPage() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyUser);
  const [editingId, setEditingId] = useState(null);
  const [passwordReset, setPasswordReset] = useState({ userId: null, password: "", passwordConfirmation: "" });
  const [feedback, setFeedback] = useState("");

  const load = () => api.getUsers().then(setUsers).catch((err) => setFeedback(err.message));
  useEffect(() => { load(); }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      if (editingId) {
        await api.updateUser(editingId, form);
        setFeedback("Usuario atualizado com sucesso.");
      } else {
        await api.createUser(form);
        setFeedback("Usuario cadastrado com sucesso.");
      }
      setForm(emptyUser);
      setEditingId(null);
      load();
    } catch (err) {
      setFeedback(err.message);
    }
  }

  async function handleResetPassword(event) {
    event.preventDefault();
    try {
      await api.resetUserPassword(passwordReset.userId, passwordReset);
      setFeedback("Senha redefinida com sucesso.");
      setPasswordReset({ userId: null, password: "", passwordConfirmation: "" });
    } catch (err) {
      setFeedback(err.message);
    }
  }

  return (
    <PageShell title="Usuarios" subtitle="Autenticacao, status, perfil e redefinicao de senha dos acessos ao sistema.">
      {feedback ? <Alert kind={feedback.includes("sucesso") ? "success" : "error"} message={feedback} /> : null}
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel title={editingId ? "Editar usuario" : "Novo usuario"} subtitle="Administrador pode criar, ativar, desativar e redefinir credenciais.">
          <form onSubmit={handleSubmit} className="grid gap-4">
            <Field label="Nome completo" value={form.fullName} onChange={(value) => setForm((current) => ({ ...current, fullName: value }))} />
            <Field label="Nome de login" value={form.username} onChange={(value) => setForm((current) => ({ ...current, username: value }))} />
            <SelectField label="Perfil" value={form.role} onChange={(value) => setForm((current) => ({ ...current, role: value }))} options={[{ value: "admin", label: "Administrador" }, { value: "user", label: "Usuario comum" }]} />
            <SelectField label="Status" value={form.status} onChange={(value) => setForm((current) => ({ ...current, status: value }))} options={[{ value: "active", label: "Ativo" }, { value: "inactive", label: "Inativo" }]} />
            {!editingId ? (
              <>
                <Field label="Senha inicial" type="password" value={form.password} onChange={(value) => setForm((current) => ({ ...current, password: value }))} />
                <Field label="Confirmacao de senha" type="password" value={form.passwordConfirmation} onChange={(value) => setForm((current) => ({ ...current, passwordConfirmation: value }))} />
              </>
            ) : null}
            <div className="flex gap-3">
              <PrimaryButton type="submit">{editingId ? "Salvar alteracoes" : "Cadastrar usuario"}</PrimaryButton>
              {editingId ? <SecondaryButton type="button" onClick={() => { setEditingId(null); setForm(emptyUser); }}>Cancelar</SecondaryButton> : null}
            </div>
          </form>
        </Panel>
        <Panel title="Contas cadastradas" subtitle="Usuarios inativos nao conseguem fazer login.">
          <div className="space-y-3">
            {users.map((user) => (
              <div key={user.id} className="rounded-3xl border border-slate-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-semibold text-slate-900">{user.fullName}</div>
                    <div className="text-sm text-slate-500">{user.username}</div>
                  </div>
                  <div className="flex gap-2">
                    <StatusBadge status={user.status === "active" ? "available" : "closed"}>{user.status === "active" ? "Ativo" : "Inativo"}</StatusBadge>
                    <StatusBadge status={user.role === "admin" ? "open" : "closed"}>{user.role === "admin" ? "Administrador" : "Usuario"}</StatusBadge>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <SecondaryButton type="button" onClick={() => { setEditingId(user.id); setForm({ ...emptyUser, fullName: user.fullName, username: user.username, role: user.role, status: user.status }); }}>Editar</SecondaryButton>
                  <SecondaryButton type="button" onClick={() => setPasswordReset({ userId: user.id, password: "", passwordConfirmation: "" })}>Redefinir senha</SecondaryButton>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
      {passwordReset.userId ? (
        <Panel title="Redefinir senha" subtitle="A nova senha precisa ter no minimo 6 caracteres.">
          <form onSubmit={handleResetPassword} className="grid gap-4 md:grid-cols-2">
            <Field label="Nova senha" type="password" value={passwordReset.password} onChange={(value) => setPasswordReset((current) => ({ ...current, password: value }))} />
            <Field label="Confirmacao" type="password" value={passwordReset.passwordConfirmation} onChange={(value) => setPasswordReset((current) => ({ ...current, passwordConfirmation: value }))} />
            <div className="md:col-span-2 flex gap-3">
              <PrimaryButton type="submit">Salvar nova senha</PrimaryButton>
              <SecondaryButton type="button" onClick={() => setPasswordReset({ userId: null, password: "", passwordConfirmation: "" })}>Cancelar</SecondaryButton>
            </div>
          </form>
        </Panel>
      ) : null}
    </PageShell>
  );
}

function CheckoutPage() {
  const [references, setReferences] = useState({ currentOpenTrip: null });
  const [form, setForm] = useState(emptyCheckout);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    api.getReferences().then(setReferences).catch((err) => setFeedback(err.message));
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      await api.checkout(form);
      setFeedback("CHECK-OUT registrado com sucesso. A devolucao foi salva automaticamente.");
      setForm(emptyCheckout);
      setReferences(await api.getReferences());
    } catch (err) {
      setFeedback(err.message);
    }
  }

  return (
    <PageShell title="CHECK-OUT - Devolver veiculo" subtitle="O sistema identifica automaticamente o veiculo retirado pelo usuario logado.">
      {feedback ? <Alert kind={feedback.includes("sucesso") ? "success" : "error"} message={feedback} /> : null}
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel title="Devolver veiculo" subtitle="Voce so pode devolver o veiculo que retirou anteriormente.">
          {!references.currentOpenTrip ? (
            <EmptyState text="Voce nao possui um veiculo em uso para devolver." />
          ) : (
            <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
              <ReadOnlyField label="Veiculo em uso" value={`${references.currentOpenTrip.vehicleModel} - ${references.currentOpenTrip.vehiclePlate}`} />
              <ReadOnlyField label="Proprietario" value={references.currentOpenTrip.vehicleOwnerName} />
              <ReadOnlyField label="Observacao do veiculo" value={references.currentOpenTrip.vehicleNotes || "Sem observacoes do veiculo."} />
              <Field label="KM final" type="number" value={form.endOdometer} onChange={(value) => setForm((current) => ({ ...current, endOdometer: value }))} required={false} />
              <Field label="Combustivel final" value={form.fuelLevelEnd} onChange={(value) => setForm((current) => ({ ...current, fuelLevelEnd: value }))} required={false} />
              <TextArea label="Observacoes da devolucao" value={form.checkoutNotes} onChange={(value) => setForm((current) => ({ ...current, checkoutNotes: value }))} className="md:col-span-2" />
              <div className="md:col-span-2"><PrimaryButton type="submit">Registrar CHECK-OUT</PrimaryButton></div>
            </form>
          )}
        </Panel>
        <Panel title="Status do usuario" subtitle="A interface mostra claramente se existe retirada aberta.">
          {references.currentOpenTrip ? <TripCard trip={references.currentOpenTrip} /> : <EmptyState text="Nenhum CHECK-IN aberto para este usuario." />}
        </Panel>
      </div>
    </PageShell>
  );
}

function CheckinPage() {
  const [references, setReferences] = useState({ vehicles: [], currentOpenTrip: null });
  const [form, setForm] = useState(emptyCheckin);
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    api.getReferences().then(setReferences).catch((err) => setFeedback(err.message));
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      await api.checkin(form);
      setFeedback("CHECK-IN registrado com sucesso. O usuario logado agora esta com o veiculo em uso.");
      setForm(emptyCheckin);
      setReferences(await api.getReferences());
    } catch (err) {
      setFeedback(err.message);
    }
  }

  return (
    <PageShell title="CHECK-IN - Retirar veiculo" subtitle="O usuario logado e automaticamente o motorista do veiculo retirado.">
      {feedback ? <Alert kind={feedback.includes("sucesso") ? "success" : "error"} message={feedback} /> : null}
      <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel title="Retirar veiculo" subtitle="Selecione apenas o veiculo. O restante e registrado automaticamente.">
          <form onSubmit={handleSubmit} className="grid gap-4">
            <SelectField label="Veiculo" value={form.vehicleId} onChange={(value) => setForm((current) => ({ ...current, vehicleId: value }))} options={references.vehicles.filter((vehicle) => vehicle.status !== "maintenance" && vehicle.status !== "inactive").map((vehicle) => ({ value: vehicle.id, label: `${vehicle.model} - ${vehicle.plate}` }))} />
            {form.vehicleId ? <ReadOnlyField label="Observacao do veiculo" value={references.vehicles.find((vehicle) => String(vehicle.id) === String(form.vehicleId))?.notes || "Sem observacoes do veiculo."} /> : null}
            <TextArea label="Motivo da retirada" value={form.checkinNotes} onChange={(value) => setForm((current) => ({ ...current, checkinNotes: value }))} />
            <div className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600">
              <div>Se outro usuario tiver esquecido de devolver esse veiculo, o sistema fara CHECK-OUT automatico.</div>
              <div>Um usuario nao pode retirar mais de um veiculo ao mesmo tempo.</div>
            </div>
            <div><PrimaryButton type="submit">Registrar CHECK-IN</PrimaryButton></div>
          </form>
        </Panel>
        <Panel title="Meu status atual" subtitle="Mostra claramente se o usuario esta com veiculo em uso.">
          {references.currentOpenTrip ? <TripCard trip={references.currentOpenTrip} /> : <EmptyState text="Nenhum veiculo em uso para este usuario." />}
        </Panel>
      </div>
    </PageShell>
  );
}

function HistoryPage({ session }) {
  const [references, setReferences] = useState({ vehicles: [], users: [] });
  const [filters, setFilters] = useState({ dateFrom: "", dateTo: "", vehicleId: "", checkoutUserId: "", status: "" });
  const [trips, setTrips] = useState([]);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    api.getReferences().then(setReferences).catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    api.getTrips(filters).then(setTrips).catch((err) => setError(err.message));
  }, [filters]);

  const filtered = useMemo(() => trips.filter((trip) => {
    const term = search.toLowerCase();
    return [trip.vehicleModel, trip.vehiclePlate, trip.userFullName, trip.vehicleOwnerName || "", trip.vehicleNotes || "", trip.checkedInByName || "", trip.checkedOutByName || ""].some((item) => (item || "").toLowerCase().includes(term));
  }), [trips, search]);

  return (
    <PageShell title="Historico" subtitle="Consulta completa de CHECK-IN, CHECK-OUT e devolucoes automaticas.">
      {error ? <Alert kind="error" message={error} /> : null}
      <Panel title="Filtros" subtitle="Usuarios comuns veem apenas o que for permitido pela configuracao do sistema.">
        <div className="grid gap-4 md:grid-cols-5">
          <Field label="De" type="date" value={filters.dateFrom} onChange={(value) => setFilters((current) => ({ ...current, dateFrom: value }))} required={false} />
          <Field label="Ate" type="date" value={filters.dateTo} onChange={(value) => setFilters((current) => ({ ...current, dateTo: value }))} required={false} />
          <SelectField label="Veiculo" value={filters.vehicleId} onChange={(value) => setFilters((current) => ({ ...current, vehicleId: value }))} options={references.vehicles.map((vehicle) => ({ value: vehicle.id, label: `${vehicle.model} - ${vehicle.plate}` }))} required={false} />
          {session.user.role === "admin" ? <SelectField label="Usuario responsavel" value={filters.checkoutUserId} onChange={(value) => setFilters((current) => ({ ...current, checkoutUserId: value }))} options={references.users.map((user) => ({ value: user.id, label: user.fullName }))} required={false} /> : null}
          <SelectField label="Status" value={filters.status} onChange={(value) => setFilters((current) => ({ ...current, status: value }))} options={[{ value: "open", label: "Em uso" }, { value: "closed", label: "Devolvido" }]} required={false} />
        </div>
      </Panel>
      <Panel title="Movimentacoes" subtitle={`${filtered.length} registro(s) encontrado(s).`}>
        <SearchField value={search} onChange={setSearch} placeholder="Buscar por veiculo, usuario, proprietario, observacao ou operador" />
        <TripsTable trips={filtered} showOperators={session.user.role === "admin"} />
      </Panel>
    </PageShell>
  );
}

function AccountPage({ session, onSessionChange }) {
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", passwordConfirmation: "" });
  const [feedback, setFeedback] = useState("");

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    try {
      await api.changeOwnPassword(passwordForm);
      setPasswordForm({ currentPassword: "", newPassword: "", passwordConfirmation: "" });
      const refreshed = await api.me();
      onSessionChange((current) => ({ ...current, user: refreshed.user }));
      setFeedback("Sua senha foi alterada com sucesso.");
    } catch (err) {
      setFeedback(err.message);
    }
  }

  return (
    <PageShell title="Minha Conta" subtitle="Area pessoal para o usuario logado alterar a propria senha com seguranca.">
      {feedback ? <Alert kind={feedback.includes("sucesso") ? "success" : "error"} message={feedback} /> : null}
      <Panel title="Alterar minha senha" subtitle={`Usuario logado: ${session.user.fullName} (${session.user.role})`}>
        <form onSubmit={handlePasswordSubmit} className="grid gap-4 md:max-w-xl">
          <Field label="Senha atual" type="password" value={passwordForm.currentPassword} onChange={(value) => setPasswordForm((current) => ({ ...current, currentPassword: value }))} />
          <Field label="Nova senha" type="password" value={passwordForm.newPassword} onChange={(value) => setPasswordForm((current) => ({ ...current, newPassword: value }))} />
          <Field label="Confirmacao" type="password" value={passwordForm.passwordConfirmation} onChange={(value) => setPasswordForm((current) => ({ ...current, passwordConfirmation: value }))} />
          <PrimaryButton type="submit" className="w-fit">Alterar minha senha</PrimaryButton>
        </form>
      </Panel>
    </PageShell>
  );
}

function SettingsPage({ session, onSessionChange }) {
  const [data, setData] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [settingsForm, setSettingsForm] = useState({ companyName: "", allowUserFullHistory: false, allowUserDashboardFull: true, preferences: {} });
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", passwordConfirmation: "" });
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    Promise.all([api.getSettings(), api.getAuditLogs()])
      .then(([settingsResult, auditResult]) => {
        setData(settingsResult);
        setSettingsForm(settingsResult.settings);
        setAuditLogs(auditResult);
      })
      .catch((err) => setFeedback(err.message));
  }, []);

  async function handleSettingsSubmit(event) {
    event.preventDefault();
    try {
      const result = await api.updateSettings(settingsForm);
      setData(result);
      setSettingsForm(result.settings);
      setFeedback("Configuracoes atualizadas com sucesso.");
    } catch (err) {
      setFeedback(err.message);
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    try {
      await api.changeOwnPassword(passwordForm);
      setPasswordForm({ currentPassword: "", newPassword: "", passwordConfirmation: "" });
      const refreshed = await api.me();
      onSessionChange((current) => ({ ...current, user: refreshed.user }));
      setFeedback("Sua senha foi alterada com sucesso.");
    } catch (err) {
      setFeedback(err.message);
    }
  }

  return (
    <PageShell title="Configuracoes" subtitle="Area administrativa para parametros gerais, permissao de historico e auditoria.">
      {feedback ? <Alert kind={feedback.includes("sucesso") ? "success" : "error"} message={feedback} /> : null}
      {!data ? <LoadingCard /> : (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <MetricCard title="Usuarios cadastrados" value={data.counts.totalUsers} accent="bg-sky-600" icon={Users} />
            <MetricCard title="Usuarios ativos" value={data.counts.activeUsers} accent="bg-emerald-500" icon={ShieldCheck} />
            <MetricCard title="Veiculos cadastrados" value={data.counts.totalVehicles} accent="bg-indigo-600" icon={CarFront} />
            <MetricCard title="Veiculos operacionais" value={data.counts.operationalVehicles} accent="bg-amber-500" icon={Gauge} />
          </div>
          <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
            <Panel title="Parametros gerais" subtitle="Controle de historico e preferencias basicas do sistema.">
              <form onSubmit={handleSettingsSubmit} className="grid gap-4">
                <Field label="Nome do sistema" value={settingsForm.companyName} onChange={(value) => setSettingsForm((current) => ({ ...current, companyName: value }))} />
                <ToggleField label="Usuarios comuns podem ver historico completo" checked={settingsForm.allowUserFullHistory} onChange={(value) => setSettingsForm((current) => ({ ...current, allowUserFullHistory: value }))} />
                <ToggleField label="Usuarios comuns podem ver dashboard completo" checked={settingsForm.allowUserDashboardFull} onChange={(value) => setSettingsForm((current) => ({ ...current, allowUserDashboardFull: value }))} />
                <PrimaryButton type="submit">Salvar configuracoes</PrimaryButton>
              </form>
            </Panel>
            <Panel title="Minha senha" subtitle={`Usuario logado: ${session.user.fullName} (${session.user.role})`}>
              <form onSubmit={handlePasswordSubmit} className="grid gap-4">
                <Field label="Senha atual" type="password" value={passwordForm.currentPassword} onChange={(value) => setPasswordForm((current) => ({ ...current, currentPassword: value }))} />
                <Field label="Nova senha" type="password" value={passwordForm.newPassword} onChange={(value) => setPasswordForm((current) => ({ ...current, newPassword: value }))} />
                <Field label="Confirmacao" type="password" value={passwordForm.passwordConfirmation} onChange={(value) => setPasswordForm((current) => ({ ...current, passwordConfirmation: value }))} />
                <PrimaryButton type="submit">Alterar minha senha</PrimaryButton>
              </form>
            </Panel>
          </div>
          <Panel title="Auditoria recente" subtitle="Registro simplificado de alteracoes administrativas e operacoes da frota.">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-slate-500">
                  <tr><th className="pb-3 font-medium">Data</th><th className="pb-3 font-medium">Acao</th><th className="pb-3 font-medium">Entidade</th><th className="pb-3 font-medium">Responsavel</th><th className="pb-3 font-medium">Detalhes</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {auditLogs.map((log) => (
                    <tr key={log.id}>
                      <td className="py-3">{formatDateTime(log.createdAt)}</td>
                      <td className="py-3">{log.action}</td>
                      <td className="py-3">{log.entityType}</td>
                      <td className="py-3">{log.actorName || "Sistema"}</td>
                      <td className="py-3">{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </>
      )}
    </PageShell>
  );
}

function VehicleDetailsPage() {
  const { id } = useParams();
  const [vehicle, setVehicle] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.getVehicle(id).then(setVehicle).catch((err) => setError(err.message));
  }, [id]);

  return (
    <PageShell title="Detalhes do veiculo" subtitle="Resumo administrativo e historico recente do ativo.">
      {error ? <Alert kind="error" message={error} /> : null}
      {!vehicle ? <LoadingCard /> : (
        <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
          <Panel title={vehicle.model} subtitle={`${vehicle.brand} - ${vehicle.plate}`}>
            <div className="space-y-4 text-sm text-slate-600">
              <div className="flex items-center justify-between"><span>Status atual</span><StatusBadge status={vehicle.status}>{vehicleStatusLabel(vehicle.status)}</StatusBadge></div>
              <div className="flex items-center justify-between"><span>Ano</span><strong className="text-slate-900">{vehicle.year}</strong></div>
              <div className="flex items-center justify-between"><span>Quilometragem atual</span><strong className="text-slate-900">{vehicle.currentOdometer}</strong></div>
              <div className="flex items-center justify-between"><span>Combustivel</span><strong className="text-slate-900">{vehicle.fuelType || "-"}</strong></div>
              <div className="flex items-center justify-between"><span>Proxima manutencao</span><strong className="text-slate-900">{formatDate(vehicle.maintenanceDueDate)}</strong></div>
              <div><div className="mb-2 font-medium text-slate-900">Observacoes</div><p>{vehicle.notes || "Sem observacoes registradas."}</p></div>
            </div>
          </Panel>
          <Panel title="Historico recente" subtitle="Movimentacoes mais recentes vinculadas ao veiculo.">
            <TripsTable trips={vehicle.recentTrips} showOperators />
          </Panel>
        </div>
      )}
    </PageShell>
  );
}

function TripsTable({ trips, showOperators = false }) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="text-left text-slate-500">
          <tr>
            <th className="pb-3 font-medium">Veiculo</th>
            <th className="pb-3 font-medium">Usuario</th>
            <th className="pb-3 font-medium">Periodo</th>
            <th className="pb-3 font-medium">Detalhes</th>
            <th className="pb-3 font-medium">KM</th>
            <th className="pb-3 font-medium">Tempo</th>
            {showOperators ? <th className="pb-3 font-medium">Operadores</th> : null}
            <th className="pb-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {trips.map((trip) => (
            <tr key={trip.id}>
              <td className="py-3"><div className="font-medium text-slate-900">{trip.vehicleModel}</div><div className="text-slate-500">{trip.vehiclePlate}</div><div className="text-slate-500">{trip.vehicleOwnerName}</div><div className="text-slate-500">{trip.vehicleNotes || "Sem observacoes"}</div></td>
              <td className="py-3">{trip.userFullName}</td>
              <td className="py-3"><div>CHECK-IN: {formatDateTime(trip.checkedInAt)}</div><div className="text-slate-500">CHECK-OUT: {formatDateTime(trip.checkedOutAt)}</div></td>
              <td className="py-3"><div>{trip.automaticCheckout ? "CHECK-OUT automatico" : "Fluxo normal"}</div><div className="text-slate-500">{trip.automaticCheckoutReason || trip.checkoutNotes || trip.checkinNotes || "-"}</div></td>
              <td className="py-3"><div>Inicial: {trip.startOdometer}</div><div className="text-slate-500">Final: {trip.endOdometer ?? "-"}</div><div className="text-slate-500">Rodado: {trip.distanceTraveled}</div></td>
              <td className="py-3">{formatMinutes(trip.usageMinutes)}</td>
              {showOperators ? <td className="py-3"><div>CHECK-IN: {trip.checkedInByName || "-"}</div><div className="text-slate-500">CHECK-OUT: {trip.checkedOutByName || "-"}</div></td> : null}
              <td className="py-3"><StatusBadge status={trip.status}>{trip.status === "open" ? "Em uso" : "Devolvido"}</StatusBadge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TripCard({ trip }) {
  return (
    <div className="rounded-3xl border border-amber-100 bg-amber-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold text-slate-900">{trip.vehicleModel}</div>
          <div className="text-sm text-slate-600">{trip.userFullName} - {trip.vehicleOwnerName}</div>
        </div>
        <StatusBadge status="in_use">Em uso</StatusBadge>
      </div>
      <div className="mt-3 grid gap-2 text-sm text-slate-600 md:grid-cols-2">
        <div>CHECK-IN: {formatDateTime(trip.checkedInAt)}</div>
        <div>KM inicial: {trip.startOdometer}</div>
        <div>Usuario: {trip.userFullName}</div>
        <div>Placa: {trip.vehiclePlate}</div>
      </div>
      <div className="mt-3 rounded-2xl bg-white/70 p-3 text-sm text-slate-600">{trip.vehicleNotes || "Sem observacoes do veiculo."}</div>
    </div>
  );
}

function PageShell({ title, subtitle, children }) {
  return (
    <div className="space-y-6">
      <header className="rounded-[28px] bg-[linear-gradient(135deg,_#0f172a,_#164e63)] px-6 py-8 text-white shadow-panel">
        <h2 className="text-3xl font-semibold">{title}</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-200">{subtitle}</p>
      </header>
      {children}
    </div>
  );
}

function Panel({ title, subtitle, children }) {
  return (
    <section className="rounded-[28px] bg-white p-6 shadow-panel">
      <div className="mb-5">
        <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
        <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
      </div>
      {children}
    </section>
  );
}

function MetricCard({ title, value, accent, icon: Icon }) {
  return (
    <div className="rounded-[28px] bg-white p-5 shadow-panel">
      <div className="flex items-center justify-between">
        <div><div className="text-sm text-slate-500">{title}</div><div className="mt-2 text-4xl font-semibold text-slate-900">{value}</div></div>
        <div className={`rounded-2xl ${accent} p-3 text-white`}><Icon size={22} /></div>
      </div>
    </div>
  );
}

function FeatureCard({ title, text }) {
  return <div className="rounded-3xl border border-white/10 bg-white/5 p-4"><div className="font-medium">{title}</div><p className="mt-2 text-sm text-slate-300">{text}</p></div>;
}

function ActionCard({ title, text, buttonLabel, onClick, tone }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-slate-50 p-4">
      <div className="font-semibold text-slate-900">{title}</div>
      <p className="mt-2 text-sm text-slate-600">{text}</p>
      <button type="button" onClick={onClick} className={`mt-4 inline-flex items-center gap-2 rounded-2xl ${tone} px-4 py-3 font-medium text-white`}>
        {buttonLabel}
        <ArrowRight size={16} />
      </button>
    </div>
  );
}

function StatusBadge({ status, children }) {
  const styles = {
    available: "bg-emerald-100 text-emerald-700",
    in_use: "bg-amber-100 text-amber-700",
    maintenance: "bg-rose-100 text-rose-700",
    inactive: "bg-slate-200 text-slate-700",
    open: "bg-blue-100 text-blue-700",
    closed: "bg-slate-100 text-slate-700"
  };
  return <span className={`rounded-full px-3 py-1 text-xs font-semibold ${styles[status] || styles.closed}`}>{children}</span>;
}

function Alert({ kind, message }) {
  const style = kind === "success" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-rose-200 bg-rose-50 text-rose-700";
  return <div className={`rounded-2xl border px-4 py-3 text-sm ${style}`}>{message}</div>;
}

function LoadingCard() {
  return <div className="rounded-[28px] bg-white p-6 text-sm text-slate-500 shadow-panel">Carregando dados...</div>;
}

function EmptyState({ text }) {
  return <div className="rounded-3xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">{text}</div>;
}

function SearchField({ value, onChange, placeholder }) {
  return (
    <label className="mb-4 flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
      <Search size={16} />
      <input type="text" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className="w-full border-none bg-transparent text-slate-900 outline-none" />
    </label>
  );
}

function Field({ label, value, onChange, type = "text", required = true }) {
  return (
    <label className="grid gap-2 text-sm text-slate-600">
      <span className="font-medium text-slate-700">{label}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-accent" required={required} />
    </label>
  );
}

function PasswordField({ label, value, onChange, showPassword, onTogglePassword, required = true }) {
  return (
    <label className="grid gap-2 text-sm text-slate-600">
      <span className="font-medium text-slate-700">{label}</span>
      <div className="flex items-center rounded-2xl border border-slate-200 bg-white px-4 py-3">
        <input
          type={showPassword ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full border-none bg-transparent text-slate-900 outline-none"
          required={required}
        />
        <button type="button" onClick={onTogglePassword} className="text-slate-500 hover:text-slate-700">
          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
    </label>
  );
}

function ReadOnlyField({ label, value }) {
  return (
    <label className="grid gap-2 text-sm text-slate-600">
      <span className="font-medium text-slate-700">{label}</span>
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-slate-500">{value}</div>
    </label>
  );
}

function SelectField({ label, value, onChange, options, required = true }) {
  return (
    <label className="grid gap-2 text-sm text-slate-600">
      <span className="font-medium text-slate-700">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-accent" required={required}>
        <option value="">Selecione</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

function ToggleField({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
      <span>{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4" />
    </label>
  );
}

function TextArea({ label, value, onChange, className = "" }) {
  return (
    <label className={`grid gap-2 text-sm text-slate-600 ${className}`}>
      <span className="font-medium text-slate-700">{label}</span>
      <textarea rows="4" value={value} onChange={(event) => onChange(event.target.value)} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 outline-none transition focus:border-accent" />
    </label>
  );
}

function PrimaryButton({ children, className = "", ...props }) {
  return <button {...props} className={`rounded-2xl bg-ink px-4 py-3 font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 ${className}`}>{children}</button>;
}

function SecondaryButton({ children, className = "", ...props }) {
  return <button {...props} className={`rounded-2xl border border-slate-200 px-4 py-3 text-slate-600 hover:bg-slate-50 ${className}`}>{children}</button>;
}

export default App;
