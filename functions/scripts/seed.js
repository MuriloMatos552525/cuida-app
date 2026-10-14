// Popula o Firestore com tarifas, feriados, especialidades e cuidadores de demonstração.
// Uso com o emulador: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm run seed
// Em produção, rode só com --reference (sem cuidadores de demonstração).
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { seedDemoCaregivers, seedReferenceData } = require('../lib/seed');

initializeApp({ projectId: process.env.GCLOUD_PROJECT || 'demo-cuida' });
const db = getFirestore();

(async () => {
  await seedReferenceData(db);
  if (!process.argv.includes('--reference')) await seedDemoCaregivers(db);
  console.log('Dados iniciais gravados.');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
