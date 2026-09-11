import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { LessonStore } from './store.js';

const projectDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDirectory = path.join(projectDirectory, 'data');
const port = Number(process.env.PORT) || 3000;

fs.mkdirSync(dataDirectory, { recursive: true });

const store = new LessonStore(path.join(dataDirectory, 'schedule.db'));
const app = createApp({ store });
const server = app.listen(port, () => {
  console.log(`Сервер запущен: http://localhost:${port}`);
});

function stop() {
  server.close(() => {
    store.close();
    process.exit(0);
  });
}

process.on('SIGINT', stop);
process.on('SIGTERM', stop);
