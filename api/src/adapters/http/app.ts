import fastifyCookie from '@fastify/cookie';
import Fastify, { type FastifyInstance } from 'fastify';
import type { DatabaseSync } from 'node:sqlite';
import { AcceptInvitation } from '../../application/accept-invitation';
import {
  GetAlertSettings,
  InjectTelemetry,
  ListAlerts,
  MarkAllAlertsRead,
  MarkAlertRead,
  type AlertDeps,
  UpdateAlertSettings,
} from '../../application/alerts';
import { AuthenticateApiKey, CreateApiKey, ListApiKeys, RevokeApiKey, RotateApiKey } from '../../application/api-keys';
import { type AuditReadDeps, ExportAuditCsv, ListAudit } from '../../application/audit';
import { ChangePassword } from '../../application/change-password';
import { CreateTerminal } from '../../application/create-terminal';
import { CreateBranch, CreateTill, ListBranches } from '../../application/branches';
import { GetSession } from '../../application/get-session';
import { GetTerminal } from '../../application/get-terminal';
import { ImportTerminals } from '../../application/import-terminals';
import { Login } from '../../application/login';
import { Logout } from '../../application/logout';
import { ListTerminals } from '../../application/list-terminals';
import type { Clock, IdGenerator, PasswordHasher } from '../../application/ports';
import { type TerminalDeps } from '../../application/terminal-deps';
import { CreateUser, ListMailbox, ListUsers, ReissueInvitation, UpdateUser, type UsersDeps } from '../../application/users';
import { UpdatePreferences } from '../../application/update-preferences';
import { UpdateTerminal } from '../../application/update-terminal';
import { SalesCsvReport, SalesReport, type ReportDeps, SummaryReport } from '../../application/reports';
import {
  CreateTransaction,
  GetReceipt,
  GetTransaction,
  InjectTransaction,
  ListPublicTransactions,
  ListTransactions,
  RefundTransaction,
  type TransactionDeps,
  VoidTransaction,
} from '../../application/transactions';
import {
  SqliteAlertRepository,
  SqliteApiKeyRepository,
  SqliteAuditLog,
  SqliteAuditQuery,
  SqliteBranchRepository,
  SqliteInvitationRepository,
  SqliteMailboxRepository,
  SqliteReportRepository,
  SqliteSessionRepository,
  SqliteTerminalRepository,
  SqliteTransactionRepository,
  SqliteUserRepository,
} from '../persistence/repositories';
import { SimulatedSwitch } from '../simulated-switch';
import { registerAlertRoutes } from './routes-alerts';
import { registerApiKeyRoutes } from './routes-api-keys';
import { registerAuditRoutes } from './routes-audit';
import { registerAuthRoutes } from './routes-auth';
import { registerBranchRoutes } from './routes-branches';
import { registerHealthRoutes } from './routes-health';
import { PUBLIC_RATE_MAX_DEFECTO, registerPublicRoutes } from './routes-public';
import { registrarPoliticas } from './politicas';
import { registerReportRoutes } from './routes-reports';
import { registerTerminalRoutes } from './routes-terminals';
import { registerTestRoutes, type TestClock } from './routes-test';
import { registerTransactionRoutes } from './routes-transactions';
import { registerUserRoutes } from './routes-users';
import { registerSecurity } from './security';

export interface AppDeps {
  db: DatabaseSync;
  clock: Clock;
  // Solo las rutas de prueba lo mueven; sin él no hay ruta /__test__/clock.
  testClock?: TestClock;
  ids: IdGenerator;
  hasher: PasswordHasher;
  config: { allowedOrigins: string[]; enableTestRoutes: boolean; loginRateMax?: number; publicRateMax?: number };
  logger?: boolean;
}

// Raíz de la API. Las rutas van dentro de un register posterior a la seguridad para que
// el límite de login y los hooks se apliquen a todas ellas.
export function buildApp(deps: AppDeps): FastifyInstance {
  const app = Fastify({
    logger: deps.logger ?? false,
    genReqId: () => deps.ids.id(),
    requestIdHeader: false,
  });
  app.register(fastifyCookie);
  registerSecurity(app, deps.config.allowedOrigins);
  app.register(async (api) => {
    registerRoutes(api, deps);
  });
  return app;
}

function registerRoutes(api: FastifyInstance, deps: AppDeps): void {
  const users = new SqliteUserRepository(deps.db);
  const sessions = new SqliteSessionRepository(deps.db);
  const branches = new SqliteBranchRepository(deps.db);
  const invitations = new SqliteInvitationRepository(deps.db);
  const mailbox = new SqliteMailboxRepository(deps.db);
  const terminals = new SqliteTerminalRepository(deps.db);
  // La bitácora se escribe en todos los casos que auditan: es una dependencia obligatoria.
  const audit = new SqliteAuditLog(deps.db);
  const alerts = new SqliteAlertRepository(deps.db);
  const sessionDeps = { users, sessions, clock: deps.clock };
  const terminalDeps: TerminalDeps = {
    ...sessionDeps,
    terminals,
    ids: deps.ids,
    audit,
  };
  const branchDeps = { ...sessionDeps, branches, ids: deps.ids };
  const usersDeps: UsersDeps = { ...sessionDeps, branches, invitations, mailbox, ids: deps.ids, audit };
  const transactionDeps: TransactionDeps = {
    ...sessionDeps,
    transactions: new SqliteTransactionRepository(deps.db),
    terminals,
    autorizador: new SimulatedSwitch(),
    ids: deps.ids,
    audit,
    alerts,
  };
  const reportDeps: ReportDeps = { ...sessionDeps, reports: new SqliteReportRepository(deps.db) };
  const apiKeys = new SqliteApiKeyRepository(deps.db);
  const apiKeyDeps = { ...sessionDeps, apiKeys, ids: deps.ids, audit };
  const alertDeps: AlertDeps = { ...sessionDeps, alerts, terminals, ids: deps.ids, audit };
  const auditDeps: AuditReadDeps = { ...sessionDeps, query: new SqliteAuditQuery(deps.db) };
  registrarPoliticas(api, sessionDeps);
  registerHealthRoutes(api, deps.db);
  registerAuthRoutes(
    api,
    {
      login: new Login({ users, sessions, hasher: deps.hasher, clock: deps.clock, ids: deps.ids, audit }),
      logout: new Logout({ sessions }),
      getSession: new GetSession(sessionDeps),
      updatePreferences: new UpdatePreferences(sessionDeps),
      changePassword: new ChangePassword({ ...sessionDeps, hasher: deps.hasher, audit }),
    },
    deps.config.loginRateMax,
  );
  registerTerminalRoutes(api, {
    list: new ListTerminals(terminalDeps),
    get: new GetTerminal(terminalDeps),
    create: new CreateTerminal(terminalDeps),
    update: new UpdateTerminal(terminalDeps),
    importCsv: new ImportTerminals(terminalDeps),
  });
  registerBranchRoutes(api, {
    list: new ListBranches(branchDeps),
    create: new CreateBranch(branchDeps),
    createTill: new CreateTill(branchDeps),
  });
  registerUserRoutes(api, {
    list: new ListUsers(usersDeps),
    create: new CreateUser(usersDeps),
    update: new UpdateUser(usersDeps),
    reissue: new ReissueInvitation(usersDeps),
    mailbox: new ListMailbox(usersDeps),
    accept: new AcceptInvitation({ invitations, hasher: deps.hasher, clock: deps.clock }),
  });
  registerTransactionRoutes(api, {
    create: new CreateTransaction(transactionDeps),
    list: new ListTransactions(transactionDeps),
    get: new GetTransaction(transactionDeps),
    void: new VoidTransaction(transactionDeps),
    refund: new RefundTransaction(transactionDeps),
    receipt: new GetReceipt(transactionDeps),
  });
  registerReportRoutes(api, {
    summary: new SummaryReport(reportDeps),
    sales: new SalesReport(reportDeps),
    salesCsv: new SalesCsvReport(reportDeps),
  });
  registerApiKeyRoutes(api, {
    create: new CreateApiKey(apiKeyDeps),
    list: new ListApiKeys(apiKeyDeps),
    revoke: new RevokeApiKey(apiKeyDeps),
    rotate: new RotateApiKey(apiKeyDeps),
  });
  registerAlertRoutes(api, {
    list: new ListAlerts(alertDeps),
    markRead: new MarkAlertRead(alertDeps),
    markAllRead: new MarkAllAlertsRead(alertDeps),
    getSettings: new GetAlertSettings(alertDeps),
    updateSettings: new UpdateAlertSettings(alertDeps),
  });
  registerAuditRoutes(api, {
    list: new ListAudit(auditDeps),
    exportCsv: new ExportAuditCsv(auditDeps),
  });
  registerPublicRoutes(
    api,
    {
      autenticar: new AuthenticateApiKey({ apiKeys, users, clock: deps.clock }),
      listTerminals: new ListTerminals(terminalDeps),
      getTerminal: new GetTerminal(terminalDeps),
      summary: new SummaryReport(reportDeps),
      sales: new SalesReport(reportDeps),
      listTransactions: new ListPublicTransactions(transactionDeps),
      getTransaction: new GetTransaction(transactionDeps),
      createTransaction: new CreateTransaction(transactionDeps),
    },
    { rateMax: deps.config.publicRateMax ?? PUBLIC_RATE_MAX_DEFECTO },
  );
  if (deps.config.enableTestRoutes) {
    registerTestRoutes(api, {
      db: deps.db,
      hasher: deps.hasher,
      clock: deps.testClock,
      inyectarTransaccion: new InjectTransaction(transactionDeps),
      telemetria: new InjectTelemetry({ terminals }),
    });
  }
}
