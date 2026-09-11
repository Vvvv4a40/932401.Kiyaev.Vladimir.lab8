const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const colorPattern = /^#[0-9a-fA-F]{6}$/;

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function validateLesson(body) {
  const lesson = {
    title: cleanText(body?.title),
    day: Number(body?.day),
    start_time: cleanText(body?.start_time),
    end_time: cleanText(body?.end_time),
    cabinet: cleanText(body?.cabinet),
    color: cleanText(body?.color)
  };
  const fields = {};

  if (!lesson.title) {
    fields.title = 'Укажите название занятия';
  } else if (lesson.title.length > 80) {
    fields.title = 'Название должно быть не длиннее 80 символов';
  }

  if (!Number.isInteger(lesson.day) || lesson.day < 1 || lesson.day > 7) {
    fields.day = 'Выберите день недели';
  }

  if (!timePattern.test(lesson.start_time)) {
    fields.start_time = 'Укажите время начала';
  }

  if (!timePattern.test(lesson.end_time)) {
    fields.end_time = 'Укажите время окончания';
  }

  if (timePattern.test(lesson.start_time) && timePattern.test(lesson.end_time) && lesson.start_time >= lesson.end_time) {
    fields.end_time = 'Окончание должно быть позже начала';
  }

  if (!lesson.cabinet) {
    fields.cabinet = 'Укажите аудиторию';
  } else if (lesson.cabinet.length > 30) {
    fields.cabinet = 'Название аудитории должно быть не длиннее 30 символов';
  }

  if (!colorPattern.test(lesson.color)) {
    fields.color = 'Выберите цвет занятия';
  }

  return {
    lesson,
    fields,
    valid: Object.keys(fields).length === 0
  };
}

export function parseId(value) {
  if (!/^\d+$/.test(value)) {
    return undefined;
  }
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : undefined;
}

export function parseDay(value) {
  if (value === undefined) {
    return { valid: true, day: undefined };
  }

  if (!/^\d+$/.test(value)) {
    return { valid: false };
  }

  const day = Number(value);
  return Number.isInteger(day) && day >= 1 && day <= 7
    ? { valid: true, day }
    : { valid: false };
}
