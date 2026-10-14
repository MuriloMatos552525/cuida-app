import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

import { Deps, handle } from './http';

// Adaptador da API HTTP (http.ts) para as funções da Vercel, chamado por api/[name].js.

let deps: Deps | undefined;

/** Conecta ao Firebase com a chave da conta de serviço em FIREBASE_SERVICE_ACCOUNT (JSON). */
function productionDeps(): Deps {
  if (!deps) {
    const key = process.env.FIREBASE_SERVICE_ACCOUNT;
    const app = getApps()[0] ?? initializeApp(key ? { credential: cert(JSON.parse(key)) } : undefined);
    const auth = getAuth(app);
    deps = {
      db: getFirestore(app),
      verifyToken: async (token) => (await auth.verifyIdToken(token)).uid,
      cronSecret: process.env.CRON_SECRET,
    };
  }
  return deps;
}

interface NodeRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[]>;
  body?: unknown;
}

interface NodeResponse {
  setHeader(name: string, value: string): void;
  status(code: number): NodeResponse;
  json(body: unknown): void;
  end(): void;
}

export async function vercelHandler(req: NodeRequest, res: NodeResponse): Promise<void> {
  // O app no navegador chama de outro domínio.
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  const name = req.query?.name;
  const authorization = req.headers.authorization;
  const out = await handle(
    {
      method: req.method ?? 'GET',
      name: Array.isArray(name) ? name[0] : (name ?? ''),
      authorization: Array.isArray(authorization) ? authorization[0] : authorization,
      body: req.body,
    },
    productionDeps(),
  );
  res.status(out.status).json(out.body);
}
