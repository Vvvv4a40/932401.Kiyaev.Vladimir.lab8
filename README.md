# Лабораторная работа №8

Вариант 12. Редактор расписания. Можно добавлять, менять и удалять занятия, выбирать день недели. Занятия не должны пересекаться по времени.

Сервер на C# и ASP.NET Core. База SQLite создаётся в `data/schedule.db`. Нужен .NET SDK 10.

## Запуск

В папке лабораторной:

```sh
dotnet run
```

Открыть [localhost:3000](http://localhost:3000).

API: `/api/schedule`. Например, `GET /api/schedule?day=2` вернёт занятия за вторник.

## Тесты

```sh
dotnet run --project tests/Lab8.Tests.csproj
```
