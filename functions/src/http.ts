import type { Firestore } from 'firebase-admin/firestore';

import { calls } from './calls';
import * as logic from './logic';

// API HTTP para quem está no plano grátis (Spark), sem Cloud Functions. Fala o mesmo protocolo das
// funções "callable": o app envia { data } com o token de login e recebe { result } ou { error }.
// Roda em qualquer servidor Node; o adaptador da Vercel fica em vercel.ts.

export interface HttpRequest {
  method: string;
  name: string;
  authorization?: string;
  body: unknown;
}

export interface HttpResponse {
  status: number;
  body: unknown;
}

export interface Deps {
  db: Firestore;
  /** Valida o token de login do Firebase e devolve o uid. */
  verifyToken: (token: string) => Promise<string>;
  /** Senha da rotina diária (CRON_SECRET). */
  cronSecret?: string;
}

const statusOf: Record<logic.AppError['code'] | 'internal', [number, string]> = {
  'invalid-argument': [400, 'INVALID_ARGUMENT'],
  'failed-precondition': [400, 'FAILED_PRECONDITION'],
  unauthenticated: [401, 'UNAUTHENTICATED'],
  'permission-denied': [403, 'PERMISSION_DENIED'],
  'not-found': [404, 'NOT_FOUND'],
  internal: [500, 'INTERNAL'],
};

function failure(code: keyof typeof statusOf, message: string): HttpResponse {
  const [status, name] = statusOf[code];
  return { status, body: { error: { status: name, message } } };
}

export async function handle(req: HttpRequest, deps: Deps): Promise<HttpResponse> {
  const token = req.authorization?.match(/^Bearer (.+)$/)?.[1];

  // Rotina diária: vence certidões, libera avaliações e recalcula quem aparece na busca.
  if (req.name === 'manutencao') {
    if (!deps.cronSecret || token !== deps.cronSecret) return failure('unauthenticated', 'Senha da rotina inválida.');
    const result = await logic.dailyMaintenance(deps.db);
    const caregivers = await logic.refreshAllCaregivers(deps.db);
    return { status: 200, body: { result: { ...result, caregivers } } };
  }

  if (req.method !== 'POST') return failure('invalid-argument', 'Use POST.');
  const call = Object.hasOwn(calls, req.name) ? calls[req.name as keyof typeof calls] : undefined;
  if (!call) return failure('not-found', 'Operação desconhecida.');

  let uid: string;
  try {
    if (!token) throw new Error('sem token');
    uid = await deps.verifyToken(token);
  } catch {
    return failure('unauthenticated', 'Entre na sua conta.');
  }

  try {
    const data = (req.body as { data?: unknown } | null)?.data ?? null;
    const result = await call(deps.db, uid, data as never);
    return { status: 200, body: { result: result ?? null } };
  } catch (e) {
    if (e instanceof logic.AppError) return failure(e.code, e.message);
    console.error(e);
    return failure('internal', 'Algo deu errado. Tente de novo.');
  }
}
