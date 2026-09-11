const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function cleanText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function validateScheduleEntry(body) {
  const entry = {
    subject: cleanText(body?.subject),
    teacher: cleanText(body?.teacher),
    room: cleanText(body?.room),
    day: Number(body?.day),
    start_time: cleanText(body?.start_time),
    end_time: cleanText(body?.end_time)
  };
  const fields = {};

  if (!entry.subject) {
    fields.subject = 'Укажите предмет';
  } else if (entry.subject.length > 80) {
    fields.subject = 'Название предмета должно быть не длиннее 80 символов';
  }

  if (!entry.teacher) {
    fields.teacher = 'Укажите преподавателя';
  } else if (entry.teacher.length > 80) {
    fields.teacher = 'Имя преподавателя должно быть не длиннее 80 символов';
  }

  if (!entry.room) {
    fields.room = 'Укажите аудиторию';
  } else if (entry.room.length > 30) {
    fields.room = 'Аудитория должна быть не длиннее 30 символов';
  }

  if (!Number.isInteger(entry.day) || entry.day < 1 || entry.day > 7) {
    fields.day = 'Выберите день недели';
  }

  if (!timePattern.test(entry.start_time)) {
    fields.start_time = 'Укажите время начала';
  }

  if (!timePattern.test(entry.end_time)) {
    fields.end_time = 'Укажите время окончания';
  }

  if (timePattern.test(entry.start_time) && timePattern.test(entry.end_time) && entry.start_time >= entry.end_time) {
    fields.end_time = 'Окончание должно быть позже начала';
  }

  return {
    entry,
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
