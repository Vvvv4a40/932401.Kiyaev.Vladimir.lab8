using System.Diagnostics;
using System.Net;
using System.Net.Http.Json;
using System.Net.Sockets;
using System.Text;
using System.Text.Json;
using Microsoft.Data.Sqlite;

var root = new DirectoryInfo(AppContext.BaseDirectory);
while (root is not null && !File.Exists(Path.Combine(root.FullName, "Lab8.csproj"))) root = root.Parent;
if (root is null) throw new InvalidOperationException("Lab8.csproj not found");
var configuration = new DirectoryInfo(AppContext.BaseDirectory).Parent!.Name;
var serverDll = Path.Combine(root.FullName, "bin", configuration, "net10.0", "Lab8.dll");
var temporaryDirectory = Path.Combine(Path.GetTempPath(), $"Lab8-tests-{Guid.NewGuid():N}");
Directory.CreateDirectory(temporaryDirectory);
var databasePath = Path.Combine(temporaryDirectory, "schedule.db");
var listener = new TcpListener(IPAddress.Loopback, 0);
listener.Start();
var port = ((IPEndPoint)listener.LocalEndpoint).Port;
listener.Stop();
using var client = new HttpClient { BaseAddress = new Uri($"http://127.0.0.1:{port}"), Timeout = TimeSpan.FromSeconds(10) };
var logs = new StringBuilder();
Process? server = null;
var checks = 0;
var completed = false;

try
{
    await StartServer();
    Assert((await client.GetStringAsync("/")).Contains("Моё расписание"), "home page");
    Assert((await client.GetStringAsync("/app.js")).Contains("getSubjectColor"), "unchanged subject colour frontend");
    Assert((await client.GetStringAsync("/styles.css")).Length > 0, "stylesheet");
    using (var connection = new SqliteConnection(new SqliteConnectionStringBuilder
    {
        DataSource = databasePath,
        Pooling = false
    }.ToString()))
    {
        connection.Open();
        using var command = connection.CreateCommand();
        command.CommandText = "PRAGMA table_info(schedule)";
        using var reader = command.ExecuteReader();
        var columns = new List<string>();
        while (reader.Read()) columns.Add(reader.GetString(1));
        Assert(columns.SequenceEqual(new[] { "id", "subject", "teacher", "room", "day", "start_time", "end_time" }), "SQLite schema");
    }

    var lesson = new Dictionary<string, object?>
    {
        ["subject"] = "  Веб-технологии  ", ["teacher"] = "Иванов И. И.", ["room"] = "312",
        ["day"] = "2", ["start_time"] = "10:00", ["end_time"] = "11:30"
    };
    var created = await Send(HttpMethod.Post, "/api/schedule", lesson, HttpStatusCode.Created);
    var id = created.GetProperty("id").GetInt64();
    Assert(created.GetProperty("subject").GetString() == "Веб-технологии", "trimmed text");
    Assert(created.GetProperty("day").GetInt32() == 2, "numeric string day");
    Assert(created.GetProperty("start_time").GetString() == "10:00", "snake_case response");
    await Send(HttpMethod.Get, $"/api/schedule/{id}", null, HttpStatusCode.OK);
    Assert((await Send(HttpMethod.Get, "/api/schedule?day=2", null, HttpStatusCode.OK)).GetArrayLength() == 1, "day filter");
    Assert((await Send(HttpMethod.Get, "/api/schedule?day=1", null, HttpStatusCode.OK)).GetArrayLength() == 0, "empty day filter");

    lesson["room"] = "314";
    var updated = await Send(HttpMethod.Put, $"/api/schedule/{id}", lesson, HttpStatusCode.OK);
    Assert(updated.GetProperty("room").GetString() == "314", "update excludes own conflict");
    var overlapping = new Dictionary<string, object?>(lesson) { ["subject"] = "Базы данных", ["start_time"] = "11:00", ["end_time"] = "12:20" };
    var conflict = await Send(HttpMethod.Post, "/api/schedule", overlapping, HttpStatusCode.BadRequest);
    Assert(conflict.GetProperty("error").GetString() == "В это время уже есть другое занятие", "conflict error");
    Assert(conflict.GetProperty("fields").GetProperty("start_time").GetString() == "Выберите свободное время", "conflict fields");
    overlapping["start_time"] = "11:30";
    var adjacent = await Send(HttpMethod.Post, "/api/schedule", overlapping, HttpStatusCode.Created);
    var adjacentId = adjacent.GetProperty("id").GetInt64();
    overlapping["start_time"] = "11:15";
    await Send(HttpMethod.Put, $"/api/schedule/{adjacentId}", overlapping, HttpStatusCode.BadRequest);
    Assert((await Send(HttpMethod.Get, $"/api/schedule/{adjacentId}", null, HttpStatusCode.OK)).GetProperty("start_time").GetString() == "11:30", "conflicting update preserves row");

    var invalidTime = new Dictionary<string, object?>(lesson) { ["start_time"] = "15:00", ["end_time"] = "14:00" };
    Assert((await Send(HttpMethod.Post, "/api/schedule", invalidTime, HttpStatusCode.BadRequest)).GetProperty("fields").TryGetProperty("end_time", out _), "time order validation");
    invalidTime["start_time"] = "24:00";
    Assert((await Send(HttpMethod.Post, "/api/schedule", invalidTime, HttpStatusCode.BadRequest)).GetProperty("fields").TryGetProperty("start_time", out _), "strict HH:mm validation");
    var missingTeacher = new Dictionary<string, object?>(lesson) { ["teacher"] = "  " };
    Assert((await Send(HttpMethod.Post, "/api/schedule", missingTeacher, HttpStatusCode.BadRequest)).GetProperty("fields").TryGetProperty("teacher", out _), "teacher required");
    var longSubject = new Dictionary<string, object?>(lesson) { ["subject"] = new string('Я', 81) };
    Assert((await Send(HttpMethod.Post, "/api/schedule", longSubject, HttpStatusCode.BadRequest)).GetProperty("fields").TryGetProperty("subject", out _), "subject length validation");
    await Send(HttpMethod.Post, "/api/schedule", new { }, HttpStatusCode.BadRequest);
    foreach (var query in new[] { "9", "-1", "2.5", "", "two", "2&day=3" })
        await Send(HttpMethod.Get, $"/api/schedule?day={query}", null, HttpStatusCode.BadRequest);
    foreach (var invalidId in new[] { "0", "-1", "nope", "9007199254740992" })
        await Send(HttpMethod.Delete, $"/api/schedule/{invalidId}", null, HttpStatusCode.BadRequest);
    await Send(HttpMethod.Get, "/api/schedule/999999", null, HttpStatusCode.NotFound);
    await Send(HttpMethod.Put, "/api/schedule/999999", new { }, HttpStatusCode.NotFound);
    await Send(HttpMethod.Delete, "/api/schedule/999999", null, HttpStatusCode.NotFound);
    Assert((await Send(HttpMethod.Get, "/api/unknown", null, HttpStatusCode.NotFound)).GetProperty("error").GetString() == "Маршрут не найден", "unknown API error");

    using (var malformed = await client.PostAsync("/api/schedule", new StringContent("{", Encoding.UTF8, "application/json")))
        Assert(malformed.StatusCode == HttpStatusCode.BadRequest, "malformed JSON");
    using (var oversized = await client.PostAsync("/api/schedule", new StringContent(JsonSerializer.Serialize(new { subject = new string('a', 33000) }), Encoding.UTF8, "application/json")))
        Assert(oversized.StatusCode == HttpStatusCode.RequestEntityTooLarge, "32 KiB request limit");
    using (var chunkedRequest = new HttpRequestMessage(HttpMethod.Post, "/api/schedule"))
    {
        chunkedRequest.Headers.TransferEncodingChunked = true;
        chunkedRequest.Content = new StringContent(JsonSerializer.Serialize(new { subject = new string('a', 33000) }), Encoding.UTF8, "application/json");
        using var oversized = await client.SendAsync(chunkedRequest);
        Assert(oversized.StatusCode == HttpStatusCode.RequestEntityTooLarge, "32 KiB limit for chunked requests");
    }

    var parallelLesson = new Dictionary<string, object?>(lesson) { ["day"] = 6 };
    var parallelResults = await Task.WhenAll(Enumerable.Range(0, 6).Select(_ => client.PostAsJsonAsync("/api/schedule", parallelLesson)));
    try
    {
        Assert(parallelResults.Count(response => response.StatusCode == HttpStatusCode.Created) == 1, "concurrent writes allow one overlapping lesson");
        Assert(parallelResults.Count(response => response.StatusCode == HttpStatusCode.BadRequest) == 5, "concurrent conflicts rejected");
    }
    finally { foreach (var response in parallelResults) response.Dispose(); }

    await StopServer();
    await StartServer();
    var persisted = await Send(HttpMethod.Get, $"/api/schedule/{id}", null, HttpStatusCode.OK);
    Assert(persisted.GetProperty("room").GetString() == "314", "SQLite persistence after restart");
    await Send(HttpMethod.Delete, $"/api/schedule/{id}", null, HttpStatusCode.NoContent);
    await Send(HttpMethod.Get, $"/api/schedule/{id}", null, HttpStatusCode.NotFound);
    Assert(File.Exists(databasePath), "database file exists");
    completed = true;
    Console.WriteLine($"PASS: {checks} checks (HTTP CRUD, validation, conflicts, concurrency, persistence, static files, SQLite schema).");
}
catch
{
    lock (logs) Console.Error.WriteLine(logs.ToString());
    throw;
}
finally
{
    await StopServer();
    var safeTemporaryPath = Path.GetFullPath(temporaryDirectory);
    if (Path.GetDirectoryName(safeTemporaryPath) == Path.GetFullPath(Path.GetTempPath()).TrimEnd(Path.DirectorySeparatorChar)
        && Path.GetFileName(safeTemporaryPath).StartsWith("Lab8-tests-", StringComparison.Ordinal))
    {
        try { Directory.Delete(safeTemporaryPath, recursive: true); }
        catch (Exception exception) when (!completed && exception is IOException or UnauthorizedAccessException)
        {
            Console.Error.WriteLine($"Cleanup failed after the test failure: {exception.Message}");
        }
    }
}

void Assert(bool condition, string name)
{
    if (!condition) throw new InvalidOperationException($"FAIL: {name}\n{logs}");
    checks++;
}

async Task<JsonElement> Send(HttpMethod method, string path, object? body, HttpStatusCode expected)
{
    using var request = new HttpRequestMessage(method, path);
    if (body is not null) request.Content = JsonContent.Create(body);
    using var response = await client.SendAsync(request);
    var content = await response.Content.ReadAsStringAsync();
    Assert(response.StatusCode == expected, $"{method} {path}: expected {(int)expected}, got {(int)response.StatusCode}: {content}");
    if (response.StatusCode == HttpStatusCode.NoContent) return default;
    return JsonSerializer.Deserialize<JsonElement>(content);
}

async Task StartServer()
{
    var startInfo = new ProcessStartInfo("dotnet")
    {
        WorkingDirectory = temporaryDirectory,
        UseShellExecute = false,
        RedirectStandardOutput = true,
        RedirectStandardError = true,
        CreateNoWindow = true
    };
    startInfo.ArgumentList.Add(serverDll);
    startInfo.ArgumentList.Add("--urls");
    startInfo.ArgumentList.Add(client.BaseAddress!.ToString().TrimEnd('/'));
    startInfo.Environment["DATABASE_PATH"] = databasePath;
    server = new Process { StartInfo = startInfo };
    server.OutputDataReceived += (_, e) => { if (e.Data is not null) lock (logs) logs.AppendLine(e.Data); };
    server.ErrorDataReceived += (_, e) => { if (e.Data is not null) lock (logs) logs.AppendLine(e.Data); };
    server.Start();
    server.BeginOutputReadLine();
    server.BeginErrorReadLine();
    for (var attempt = 0; attempt < 100; attempt++)
    {
        if (server.HasExited) throw new InvalidOperationException($"Server exited: {logs}");
        try
        {
            using var response = await client.GetAsync("/api/schedule");
            if (response.IsSuccessStatusCode) return;
        }
        catch (HttpRequestException exception) when (exception.InnerException is SocketException { SocketErrorCode: SocketError.AccessDenied })
        {
            throw new InvalidOperationException("Localhost connections blocked by execution sandbox", exception);
        }
        catch (HttpRequestException) { }
        await Task.Delay(100);
    }
    throw new TimeoutException($"Server did not start: {logs}");
}

async Task StopServer()
{
    if (server is null) return;
    if (!server.HasExited)
    {
        server.Kill(entireProcessTree: true);
        await server.WaitForExitAsync();
    }
    server.Dispose();
    server = null;
}
