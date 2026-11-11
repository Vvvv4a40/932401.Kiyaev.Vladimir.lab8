using System.Globalization;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace Lab8;

public sealed record ScheduleEntry(long Id, string Subject, string Teacher, string Room, int Day,
    [property: System.Text.Json.Serialization.JsonPropertyName("start_time")] string StartTime,
    [property: System.Text.Json.Serialization.JsonPropertyName("end_time")] string EndTime);

public sealed record EntryValidation(ScheduleEntry Entry, Dictionary<string, string> Fields)
{
    public bool IsValid => Fields.Count == 0;
}

public static partial class ScheduleValidation
{
    public static EntryValidation Validate(JsonElement body)
    {
        var dayValue = GetProperty(body, "day");
        var day = Number(dayValue);
        var entry = new ScheduleEntry(0, Text(body, "subject"), Text(body, "teacher"), Text(body, "room"),
            day is >= 1 and <= 7 && day == Math.Truncate(day) ? (int)day : 0,
            Text(body, "start_time"), Text(body, "end_time"));
        var fields = new Dictionary<string, string>();

        if (entry.Subject.Length == 0) fields["subject"] = "Укажите предмет";
        else if (entry.Subject.Length > 80) fields["subject"] = "Название предмета должно быть не длиннее 80 символов";
        if (entry.Teacher.Length == 0) fields["teacher"] = "Укажите преподавателя";
        else if (entry.Teacher.Length > 80) fields["teacher"] = "Имя преподавателя должно быть не длиннее 80 символов";
        if (entry.Room.Length == 0) fields["room"] = "Укажите аудиторию";
        else if (entry.Room.Length > 30) fields["room"] = "Аудитория должна быть не длиннее 30 символов";
        if (entry.Day == 0) fields["day"] = "Выберите день недели";
        var validStart = TimePattern().IsMatch(entry.StartTime);
        var validEnd = TimePattern().IsMatch(entry.EndTime);
        if (!validStart) fields["start_time"] = "Укажите время начала";
        if (!validEnd) fields["end_time"] = "Укажите время окончания";
        if (validStart && validEnd && string.CompareOrdinal(entry.StartTime, entry.EndTime) >= 0)
            fields["end_time"] = "Окончание должно быть позже начала";
        return new(entry, fields);
    }

    public static bool TryParseId(string value, out long id)
    {
        id = 0;
        return Digits().IsMatch(value) && long.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out id)
            && id is > 0 and <= 9_007_199_254_740_991;
    }

    public static bool TryParseDay(string value, out int day)
    {
        day = 0;
        return Digits().IsMatch(value) && int.TryParse(value, NumberStyles.None, CultureInfo.InvariantCulture, out day)
            && day is >= 1 and <= 7;
    }

    private static JsonElement GetProperty(JsonElement body, string name) =>
        body.ValueKind == JsonValueKind.Object && body.TryGetProperty(name, out var value) ? value : default;

    private static string Text(JsonElement body, string name)
    {
        var value = GetProperty(body, name);
        return value.ValueKind == JsonValueKind.String ? value.GetString()!.Trim() : "";
    }

    private static double Number(JsonElement value) => value.ValueKind switch
    {
        JsonValueKind.Number => value.GetDouble(),
        JsonValueKind.String => double.TryParse(value.GetString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var number)
            ? number : double.NaN,
        JsonValueKind.True => 1,
        _ => double.NaN
    };

    [GeneratedRegex(@"\A(?:[01][0-9]|2[0-3]):[0-5][0-9]\z")]
    private static partial Regex TimePattern();
    [GeneratedRegex(@"\A[0-9]+\z")]
    private static partial Regex Digits();
}
