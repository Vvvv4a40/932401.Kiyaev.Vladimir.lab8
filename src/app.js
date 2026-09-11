import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDay, parseId, validateScheduleEntry } from './validation.js';

const publicDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public');

function badRequest(res, message, fields) {
  const response = { error: message };
  if (fields) {
    response.fields = fields;
  }
  return res.status(400).json(response);
}

export function createApp({ store }) {
  if (!store) {
    throw new TypeError('Store is required');
  }

  const app = express();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));

  app.get('/api/schedule', (req, res) => {
    const filter = parseDay(req.query.day);
    if (!filter.valid) {
      return badRequest(res, 'День должен быть числом от 1 до 7');
    }
    return res.json(store.list(filter.day));
  });

  app.get('/api/schedule/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      return badRequest(res, 'Некорректный идентификатор занятия');
    }

    const lesson = store.get(id);
    if (!lesson) {
      return res.status(404).json({ error: 'Занятие не найдено' });
    }
    return res.json(lesson);
  });

  app.post('/api/schedule', (req, res) => {
    const validation = validateScheduleEntry(req.body);
    if (!validation.valid) {
      return badRequest(res, 'Проверьте заполненные поля', validation.fields);
    }

    if (store.hasConflict(validation.entry)) {
      return badRequest(res, 'В это время уже есть другое занятие', {
        start_time: 'Выберите свободное время',
        end_time: 'Выберите свободное время'
      });
    }

    return res.status(201).json(store.create(validation.entry));
  });

  app.put('/api/schedule/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      return badRequest(res, 'Некорректный идентификатор занятия');
    }

    if (!store.get(id)) {
      return res.status(404).json({ error: 'Занятие не найдено' });
    }

    const validation = validateScheduleEntry(req.body);
    if (!validation.valid) {
      return badRequest(res, 'Проверьте заполненные поля', validation.fields);
    }

    if (store.hasConflict(validation.entry, id)) {
      return badRequest(res, 'В это время уже есть другое занятие', {
        start_time: 'Выберите свободное время',
        end_time: 'Выберите свободное время'
      });
    }

    return res.json(store.update(id, validation.entry));
  });

  app.delete('/api/schedule/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (!id) {
      return badRequest(res, 'Некорректный идентификатор занятия');
    }

    if (!store.remove(id)) {
      return res.status(404).json({ error: 'Занятие не найдено' });
    }
    return res.status(204).end();
  });

  app.use('/api', (req, res) => {
    res.status(404).json({ error: 'Маршрут не найден' });
  });

  app.use(express.static(publicDirectory));

  app.use((error, req, res, next) => {
    if (res.headersSent) {
      return next(error);
    }
    console.error(error);
    return res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  });

  return app;
}
