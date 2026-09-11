import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { LessonStore } from '../src/store.js';

function setup() {
  const store = new LessonStore();
  const app = createApp({ store });
  return { app, store };
}

const lesson = {
  title: 'Веб-технологии',
  day: 2,
  start_time: '10:00',
  end_time: '11:30',
  cabinet: '312',
  color: '#3768b5'
};

test('создание, изменение и удаление занятия', async () => {
  const { app, store } = setup();

  try {
    const created = await request(app).post('/api/lessons').send(lesson).expect(201);
    assert.equal(created.body.title, lesson.title);

    const filtered = await request(app).get('/api/lessons?day=2').expect(200);
    assert.equal(filtered.body.length, 1);

    const updated = await request(app)
      .put(`/api/lessons/${created.body.id}`)
      .send({ ...lesson, cabinet: '314' })
      .expect(200);
    assert.equal(updated.body.cabinet, '314');

    await request(app).delete(`/api/lessons/${created.body.id}`).expect(204);
    const list = await request(app).get('/api/lessons').expect(200);
    assert.deepEqual(list.body, []);
  } finally {
    store.close();
  }
});

test('проверка времени и пересечений', async () => {
  const { app, store } = setup();

  try {
    await request(app).post('/api/lessons').send(lesson).expect(201);

    const conflict = await request(app).post('/api/lessons').send({
      ...lesson,
      title: 'Базы данных',
      start_time: '11:00',
      end_time: '12:20'
    }).expect(400);
    assert.match(conflict.body.error, /уже есть/);

    const wrongOrder = await request(app).post('/api/lessons').send({
      ...lesson,
      start_time: '15:00',
      end_time: '14:00'
    }).expect(400);
    assert.ok(wrongOrder.body.fields.end_time);
  } finally {
    store.close();
  }
});

test('ошибки фильтра и отсутствующей записи', async () => {
  const { app, store } = setup();

  try {
    await request(app).get('/api/lessons?day=9').expect(400);
    await request(app).get('/api/lessons/777').expect(404);
    await request(app).delete('/api/lessons/nope').expect(400);
  } finally {
    store.close();
  }
});
