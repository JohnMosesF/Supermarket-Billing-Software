import { app } from './app.js';
import { ensureDefaultData } from './bootstrap.js';
import { connectDB } from './config/db.js';
import { env } from './config/env.js';

async function start() {
  await connectDB();
  if (env.autoSeedOnStart) {
    await ensureDefaultData();
  }
  app.listen(env.port, () => {
    console.log(`API listening on http://localhost:${env.port}`);
  });
}

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
