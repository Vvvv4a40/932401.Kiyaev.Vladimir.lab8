import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { ScheduleStore } from '../src/store.js';

function setup() {
  const store = new ScheduleStore();
  const app = createApp({ store });
  return { app, store };
}

const lesson = {
  subject: 'Веб-технологии',
  teacher: 'Иванов И. И.',
  room: '312',
  day: 2,
  start_time: '10:00',
  end_time: '11:30'
};

test('схема расписания соответствует варианту', () => {
  const store = new ScheduleStore();

  try {
    const columns = store.db.prepare('PRAGMA table_info(schedule)').all().map((column) => column.name);
    assert.deepEqual(columns, ['id', 'subject', 'teacher', 'room', 'day', 'start_time', 'end_time']);
  } finally {
    store.close();
  }
});

test('создание, изменение и удаление занятия', async () => {
  const { app, store } = setup();

  try {
    const created = await request(app).post('/api/schedule').send(lesson).expect(201);
    assert.equal(created.body.subject, lesson.subject);
    assert.equal(created.body.teacher, lesson.teacher);

    const one = await request(app).get(`/api/schedule/${created.body.id}`).expect(200);
    assert.equal(one.body.room, lesson.room);

    const filtered = await request(app).get('/api/schedule?day=2').expect(200);
    assert.equal(filtered.body.length, 1);

    const updated = await request(app)
      .put(`/api/schedule/${created.body.id}`)
      .send({ ...lesson, room: '314' })
      .expect(200);
    assert.equal(updated.body.room, '314');

    await request(app).delete(`/api/schedule/${created.body.id}`).expect(204);
    const list = await request(app).get('/api/schedule').expect(200);
    assert.deepEqual(list.body, []);
  } finally {
    store.close();
  }
});

test('проверка времени и пересечений', async () => {
  const { app, store } = setup();

  try {
    await request(app).post('/api/schedule').send(lesson).expect(201);

    const conflict = await request(app).post('/api/schedule').send({
      ...lesson,
      subject: 'Базы данных',
      start_time: '11:00',
      end_time: '12:20'
    }).expect(400);
    assert.match(conflict.body.error, /уже есть/);

    await request(app).post('/api/schedule').send({
      ...lesson,
      subject: 'Базы данных',
      start_time: '11:30',
      end_time: '12:20'
    }).expect(201);

    const wrongOrder = await request(app).post('/api/schedule').send({
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
    await request(app).get('/api/schedule?day=9').expect(400);
    await request(app).get('/api/schedule/777').expect(404);
    await request(app).delete('/api/schedule/nope').expect(400);

    const missingTeacher = await request(app).post('/api/schedule').send({
      ...lesson,
      teacher: ''
    }).expect(400);
    assert.ok(missingTeacher.body.fields.teacher);
  } finally {
    store.close();
  }
});
