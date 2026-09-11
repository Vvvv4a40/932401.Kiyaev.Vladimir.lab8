import Database from 'better-sqlite3';

export class LessonStore {
  constructor(filename = ':memory:') {
    this.db = new Database(filename);
    this.db.pragma('foreign_keys = ON');
    if (filename !== ':memory:') {
      this.db.pragma('journal_mode = WAL');
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS lessons (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        day INTEGER NOT NULL CHECK (day BETWEEN 1 AND 7),
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        cabinet TEXT NOT NULL,
        color TEXT NOT NULL,
        CHECK (start_time < end_time)
      );

      CREATE INDEX IF NOT EXISTS lessons_day_time_idx
      ON lessons (day, start_time, end_time);
    `);
  }

  list(day) {
    if (day === undefined) {
      return this.db.prepare(`
        SELECT id, title, day, start_time, end_time, cabinet, color
        FROM lessons
        ORDER BY day, start_time, title
      `).all();
    }

    return this.db.prepare(`
      SELECT id, title, day, start_time, end_time, cabinet, color
      FROM lessons
      WHERE day = ?
      ORDER BY start_time, title
    `).all(day);
  }

  get(id) {
    return this.db.prepare(`
      SELECT id, title, day, start_time, end_time, cabinet, color
      FROM lessons
      WHERE id = ?
    `).get(id);
  }

  hasConflict({ day, start_time, end_time }, excludedId) {
    let sql = `
      SELECT id
      FROM lessons
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

  create(lesson) {
    const result = this.db.prepare(`
      INSERT INTO lessons (title, day, start_time, end_time, cabinet, color)
      VALUES (@title, @day, @start_time, @end_time, @cabinet, @color)
    `).run(lesson);

    return this.get(Number(result.lastInsertRowid));
  }

  update(id, lesson) {
    const result = this.db.prepare(`
      UPDATE lessons
      SET title = @title,
          day = @day,
          start_time = @start_time,
          end_time = @end_time,
          cabinet = @cabinet,
          color = @color
      WHERE id = @id
    `).run({ id, ...lesson });

    return result.changes === 0 ? undefined : this.get(id);
  }

  remove(id) {
    return this.db.prepare('DELETE FROM lessons WHERE id = ?').run(id).changes > 0;
  }

  close() {
    this.db.close();
  }
}
