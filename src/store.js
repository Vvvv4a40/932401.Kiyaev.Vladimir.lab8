import Database from 'better-sqlite3';

export class ScheduleStore {
  constructor(filename = ':memory:') {
    this.db = new Database(filename);
    this.db.pragma('foreign_keys = ON');
    if (filename !== ':memory:') {
      this.db.pragma('journal_mode = WAL');
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schedule (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        subject TEXT NOT NULL,
        teacher TEXT NOT NULL,
        room TEXT NOT NULL,
        day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 7),
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        CHECK (start_time < end_time)
      );

      CREATE INDEX IF NOT EXISTS schedule_day_time_idx
      ON schedule (day, start_time, end_time);
    `);
  }

  list(day) {
    if (day === undefined) {
      return this.db.prepare(`
        SELECT id, subject, teacher, room, day, start_time, end_time
        FROM schedule
        ORDER BY day, start_time, subject
      `).all();
    }

    return this.db.prepare(`
      SELECT id, subject, teacher, room, day, start_time, end_time
      FROM schedule
      WHERE day = ?
      ORDER BY start_time, subject
    `).all(day);
  }

  get(id) {
    return this.db.prepare(`
      SELECT id, subject, teacher, room, day, start_time, end_time
      FROM schedule
      WHERE id = ?
    `).get(id);
  }

  hasConflict({ day, start_time, end_time }, excludedId) {
    let sql = `
      SELECT id
      FROM schedule
      WHERE day = @day
        AND start_time < @end_time
        AND end_time > @start_time
    `;

    if (excludedId !== undefined) {
      sql += ' AND id != @excluded_id';
    }

    return Boolean(this.db.prepare(sql).get({
      day,
      start_time,
      end_time,
      excluded_id: excludedId
    }));
  }

  create(entry) {
    const result = this.db.prepare(`
      INSERT INTO schedule (subject, teacher, room, day, start_time, end_time)
      VALUES (@subject, @teacher, @room, @day, @start_time, @end_time)
    `).run(entry);

    return this.get(Number(result.lastInsertRowid));
  }

  update(id, entry) {
    const result = this.db.prepare(`
      UPDATE schedule
      SET subject = @subject,
          teacher = @teacher,
          room = @room,
          day = @day,
          start_time = @start_time,
          end_time = @end_time
      WHERE id = @id
    `).run({ id, ...entry });

    return result.changes === 0 ? undefined : this.get(id);
  }

  remove(id) {
    return this.db.prepare('DELETE FROM schedule WHERE id = ?').run(id).changes > 0;
  }

  close() {
    this.db.close();
  }
}
