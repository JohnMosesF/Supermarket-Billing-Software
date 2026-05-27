import { connectDB } from './config/db.js';
import { ensureDefaultData } from './bootstrap.js';

async function seed() {
  await connectDB();
  await ensureDefaultData();
  console.log('Seed complete. Login: admin@store.com / Admin@12345');
  process.exit(0);
}

seed().catch((error) => {
  console.error(error);
  process.exit(1);
});
