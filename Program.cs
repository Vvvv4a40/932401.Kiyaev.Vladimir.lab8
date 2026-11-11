using System.Text.Json;
using Lab8;

var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = AppContext.BaseDirectory,
    WebRootPath = "public"
});

if (string.IsNullOrEmpty(builder.Configuration["urls"]))
{
    var port = int.TryParse(Environment.GetEnvironmentVariable("PORT"), out var value)
        && value is > 0 and <= 65535 ? value : 3000;
    builder.WebHost.UseUrls($"http://localhost:{port}");
}

var projectDirectory = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../.."));
var dataDirectory = File.Exists(Path.Combine(projectDirectory, "Lab8.csproj"))
    ? projectDirectory : AppContext.BaseDirectory;
var databasePath = Environment.GetEnvironmentVariable("DATABASE_PATH")
    ?? Path.Combine(dataDirectory, "data", "schedule.db");
builder.Services.AddSingleton(_ => new ScheduleStore(databasePath));
var app = builder.Build();
// Fail at startup if the database cannot be opened or its schema is incompatible.
_ = app.Services.GetRequiredService<ScheduleStore>();

app.Use(async (context, next) =>
{
    try
    {
        await next(context);
    }
    catch (JsonException)
    {
        context.Response.StatusCode = StatusCodes.Status400BadRequest;
        await context.Response.WriteAsJsonAsync(new { error = "Некорректный JSON" });
    }
    catch (BadHttpRequestException exception) when (!context.Response.HasStarted)
    {
        context.Response.StatusCode = exception.StatusCode;
        await context.Response.WriteAsJsonAsync(new { error = "Некорректный запрос" });
    }
    catch (Exception exception) when (!context.Response.HasStarted)
    {
        app.Logger.LogError(exception, "Ошибка обработки запроса");
        context.Response.StatusCode = StatusCodes.Status500InternalServerError;
        await context.Response.WriteAsJsonAsync(new { error = "Внутренняя ошибка сервера" });
    }
});

app.UseDefaultFiles();
app.UseStaticFiles();
app.UseRouting();

app.MapGet("/api/schedule", (HttpRequest request, ScheduleStore store) =>
{
    var filter = request.Query["day"];
    if (!request.Query.ContainsKey("day"))
        return Results.Ok(store.List());
    if (!ScheduleValidation.TryParseDay(filter.ToString(), out var day))
        return Error("День должен быть числом от 1 до 7");
    return Results.Ok(store.List(day));
});

app.MapGet("/api/schedule/{id}", (string id, ScheduleStore store) =>
{
    if (!ScheduleValidation.TryParseId(id, out var lessonId))
        return Error("Некорректный идентификатор занятия");
    var entry = store.Get(lessonId);
    return entry is null ? Results.NotFound(new { error = "Занятие не найдено" }) : Results.Ok(entry);
});

app.MapPost("/api/schedule", async (HttpContext context, ScheduleStore store) =>
{
    var validation = ScheduleValidation.Validate(await ReadBody(context));
    if (!validation.IsValid)
        return Error("Проверьте заполненные поля", validation.Fields);
    var result = store.Save(validation.Entry);
    return result.Status == SaveStatus.Conflict
        ? Conflict()
        : Results.Json(result.Entry, statusCode: StatusCodes.Status201Created);
});

app.MapPut("/api/schedule/{id}", async (string id, HttpContext context, ScheduleStore store) =>
{
    if (!ScheduleValidation.TryParseId(id, out var lessonId))
        return Error("Некорректный идентификатор занятия");
    if (store.Get(lessonId) is null)
        return Results.NotFound(new { error = "Занятие не найдено" });
    var validation = ScheduleValidation.Validate(await ReadBody(context));
    if (!validation.IsValid)
        return Error("Проверьте заполненные поля", validation.Fields);
    var result = store.Save(validation.Entry, lessonId);
    return result.Status switch
    {
        SaveStatus.Conflict => Conflict(),
        SaveStatus.Missing => Results.NotFound(new { error = "Занятие не найдено" }),
        _ => Results.Ok(result.Entry)
    };
});

app.MapDelete("/api/schedule/{id}", (string id, ScheduleStore store) =>
{
    if (!ScheduleValidation.TryParseId(id, out var lessonId))
        return Error("Некорректный идентификатор занятия");
    return store.Remove(lessonId)
        ? Results.NoContent()
        : Results.NotFound(new { error = "Занятие не найдено" });
});

app.MapFallback("/api/{**path}", () => Results.NotFound(new { error = "Маршрут не найден" }));
app.Run();

static IResult Error(string message, Dictionary<string, string>? fields = null) => fields is null
    ? Results.BadRequest(new { error = message })
    : Results.BadRequest(new { error = message, fields });

static IResult Conflict() => Error("В это время уже есть другое занятие", new()
{
    ["start_time"] = "Выберите свободное время",
    ["end_time"] = "Выберите свободное время"
});

static async Task<JsonElement> ReadBody(HttpContext context)
{
    const int limit = 32 * 1024;
    if (context.Request.ContentLength is > limit)
        throw TooLarge(context);
    if (context.Request.ContentLength == 0 || !context.Request.HasJsonContentType())
        return default;

    // Read at most one byte beyond the limit, including for chunked requests.
    // Setting Kestrel's own limit to 32 KiB can abort its response while draining
    // an unread oversized request, so the application enforces the JSON limit.
    using var body = new MemoryStream();
    var buffer = new byte[4096];
    while (true)
    {
        var read = await context.Request.Body.ReadAsync(buffer.AsMemory(0, Math.Min(buffer.Length, limit + 1 - (int)body.Length)),
            context.RequestAborted);
        if (read == 0) break;
        await body.WriteAsync(buffer.AsMemory(0, read), context.RequestAborted);
        if (body.Length > limit) throw TooLarge(context);
    }
    body.Position = 0;
    using var document = await JsonDocument.ParseAsync(body,
        cancellationToken: context.RequestAborted);
    return document.RootElement.Clone();
}

static BadHttpRequestException TooLarge(HttpContext context)
{
    // An unread HTTP/1.1 request body must not be reused for another request.
    if (context.Request.Protocol == "HTTP/1.1") context.Response.Headers.Connection = "close";
    return new BadHttpRequestException("Request body too large", StatusCodes.Status413PayloadTooLarge);
}
