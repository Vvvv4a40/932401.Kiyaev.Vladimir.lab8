using Microsoft.Data.Sqlite;

namespace Lab8;

public enum SaveStatus { Saved, Missing, Conflict }
public sealed record SaveResult(SaveStatus Status, ScheduleEntry? Entry = null);

public sealed class ScheduleStore : IDisposable
{
    private readonly SqliteConnection connection;
    private readonly object gate = new();

    public ScheduleStore(string filename)
    {
        if (filename != ":memory:")
        {
            filename = Path.GetFullPath(filename);
            Directory.CreateDirectory(Path.GetDirectoryName(filename)!);
        }
        connection = new SqliteConnection(new SqliteConnectionStringBuilder
        {
            DataSource = filename,
            ForeignKeys = true,
            Pooling = false
        }.ToString());
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = (filename == ":memory:" ? "" : "PRAGMA journal_mode = WAL;") + """
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
            """;
        command.ExecuteNonQuery();
    }

    public IReadOnlyList<ScheduleEntry> List(int? day = null)
    {
        lock (gate)
        {
            using var command = connection.CreateCommand();
            command.CommandText = "SELECT id, subject, teacher, room, day, start_time, end_time FROM schedule "
                + (day.HasValue ? "WHERE day = $day ORDER BY start_time, subject" : "ORDER BY day, start_time, subject");
            if (day.HasValue) command.Parameters.AddWithValue("$day", day.Value);
            using var reader = command.ExecuteReader();
            var entries = new List<ScheduleEntry>();
            while (reader.Read()) entries.Add(Read(reader));
            return entries;
        }
    }

    public ScheduleEntry? Get(long id)
    {
        lock (gate) return GetCore(id);
    }

    // Both the conflict check and the write run inside an immediate transaction.
    // This also prevents overlapping lessons when two server processes share a database.
    public SaveResult Save(ScheduleEntry entry, long? id = null)
    {
        lock (gate)
        {
            using var transaction = connection.BeginTransaction();
            if (id.HasValue && GetCore(id.Value, transaction) is null)
                return new(SaveStatus.Missing);

            using var conflict = connection.CreateCommand();
            conflict.Transaction = transaction;
            conflict.CommandText = """
                SELECT id FROM schedule
                WHERE day = $day AND start_time < $end_time AND end_time > $start_time
                  AND ($id IS NULL OR id != $id)
                LIMIT 1
                """;
            conflict.Parameters.AddWithValue("$day", entry.Day);
            conflict.Parameters.AddWithValue("$start_time", entry.StartTime);
            conflict.Parameters.AddWithValue("$end_time", entry.EndTime);
            conflict.Parameters.AddWithValue("$id", (object?)id ?? DBNull.Value);
            if (conflict.ExecuteScalar() is not null)
                return new(SaveStatus.Conflict);

            using var command = connection.CreateCommand();
            command.Transaction = transaction;
            command.CommandText = id.HasValue
                ? """
                  UPDATE schedule SET subject = $subject, teacher = $teacher, room = $room,
                    day = $day, start_time = $start_time, end_time = $end_time WHERE id = $id;
                  """
                : """
                  INSERT INTO schedule (subject, teacher, room, day, start_time, end_time)
                  VALUES ($subject, $teacher, $room, $day, $start_time, $end_time);
                  SELECT last_insert_rowid();
                  """;
            command.Parameters.AddWithValue("$subject", entry.Subject);
            command.Parameters.AddWithValue("$teacher", entry.Teacher);
            command.Parameters.AddWithValue("$room", entry.Room);
            command.Parameters.AddWithValue("$day", entry.Day);
            command.Parameters.AddWithValue("$start_time", entry.StartTime);
            command.Parameters.AddWithValue("$end_time", entry.EndTime);
            if (id.HasValue) command.Parameters.AddWithValue("$id", id.Value);
            var savedId = id ?? (long)command.ExecuteScalar()!;
            if (id.HasValue) command.ExecuteNonQuery();
            var saved = GetCore(savedId, transaction);
            transaction.Commit();
            return new(SaveStatus.Saved, saved);
        }
    }

    public bool Remove(long id)
    {
        lock (gate)
        {
            using var command = connection.CreateCommand();
            command.CommandText = "DELETE FROM schedule WHERE id = $id";
            command.Parameters.AddWithValue("$id", id);
            return command.ExecuteNonQuery() > 0;
        }
    }

    private ScheduleEntry? GetCore(long id, SqliteTransaction? transaction = null)
    {
        using var command = connection.CreateCommand();
        command.Transaction = transaction;
        command.CommandText = "SELECT id, subject, teacher, room, day, start_time, end_time FROM schedule WHERE id = $id";
        command.Parameters.AddWithValue("$id", id);
        using var reader = command.ExecuteReader();
        return reader.Read() ? Read(reader) : null;
    }

    private static ScheduleEntry Read(SqliteDataReader reader) => new(reader.GetInt64(0), reader.GetString(1),
        reader.GetString(2), reader.GetString(3), reader.GetInt32(4), reader.GetString(5), reader.GetString(6));

    public void Dispose()
    {
        lock (gate) connection.Dispose();
    }
}
