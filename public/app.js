const days = [
  { value: 1, name: 'Понедельник', short: 'Пн' },
  { value: 2, name: 'Вторник', short: 'Вт' },
  { value: 3, name: 'Среда', short: 'Ср' },
  { value: 4, name: 'Четверг', short: 'Чт' },
  { value: 5, name: 'Пятница', short: 'Пт' },
  { value: 6, name: 'Суббота', short: 'Сб' },
  { value: 7, name: 'Воскресенье', short: 'Вс' }
];
const subjectColors = ['#3768b5', '#7b4ca0', '#2f766d', '#a4475b', '#9a5a24', '#315f8d'];

const schedule = document.querySelector('#schedule');
const dayFilter = document.querySelector('#day-filter');
const lessonCount = document.querySelector('#lesson-count');
const notice = document.querySelector('#notice');
const dialog = document.querySelector('#lesson-dialog');
const form = document.querySelector('#lesson-form');
const dialogTitle = document.querySelector('#dialog-title');
const saveButton = document.querySelector('#save-button');
const addButton = document.querySelector('#add-button');
const closeDialogButton = document.querySelector('#close-dialog');
const cancelButton = document.querySelector('#cancel-button');
const entryId = document.querySelector('#lesson-id');
const subjectInput = document.querySelector('#subject');
const teacherInput = document.querySelector('#teacher');
const roomInput = document.querySelector('#room');
const dayInput = document.querySelector('#day');
const startTimeInput = document.querySelector('#start-time');
const endTimeInput = document.querySelector('#end-time');

let scheduleEntries = [];
let noticeTimer;
let dialogReturnFocus = addButton;

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options
  });

  if (response.status === 204) {
    return undefined;
  }

  let data;
  try {
    data = await response.json();
  } catch {
    data = {};
  }

  if (!response.ok) {
    const error = new Error(data.error || 'Не удалось выполнить запрос');
    error.fields = data.fields;
    throw error;
  }

  return data;
}

function showNotice(message, type = 'success') {
  clearTimeout(noticeTimer);
  notice.textContent = message;
  notice.dataset.type = type;
  notice.hidden = false;
  noticeTimer = setTimeout(() => {
    notice.hidden = true;
  }, 3500);
}

function getSubjectColor(subject) {
  let hash = 0;
  for (const character of subject.trim().toLowerCase()) {
    hash = (hash * 31 + character.codePointAt(0)) >>> 0;
  }
  return subjectColors[hash % subjectColors.length];
}

function createScheduleCard(entry) {
  const card = document.createElement('article');
  card.className = 'lesson-card';
  card.style.setProperty('--lesson-color', getSubjectColor(entry.subject));

  const time = document.createElement('p');
  time.className = 'lesson-time';
  time.textContent = `${entry.start_time}–${entry.end_time}`;

  const title = document.createElement('h3');
  title.textContent = entry.subject;

  const teacher = document.createElement('p');
  teacher.className = 'lesson-teacher';
  teacher.textContent = entry.teacher;

  const room = document.createElement('p');
  room.className = 'lesson-room';
  room.textContent = `Аудитория ${entry.room}`;

  const actions = document.createElement('div');
  actions.className = 'lesson-actions';

  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.className = 'text-button';
  editButton.dataset.action = 'edit';
  editButton.dataset.id = entry.id;
  editButton.textContent = 'Изменить';
  editButton.setAttribute('aria-label', `Изменить занятие «${entry.subject}»`);

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'text-button danger-button';
  deleteButton.dataset.action = 'delete';
  deleteButton.dataset.id = entry.id;
  deleteButton.textContent = 'Удалить';
  deleteButton.setAttribute('aria-label', `Удалить занятие «${entry.subject}»`);

  actions.append(editButton, deleteButton);
  card.append(time, title, teacher, room, actions);
  return card;
}

function createDayColumn(day) {
  const column = document.createElement('section');
  column.className = 'day-column';
  column.setAttribute('aria-labelledby', `day-${day.value}`);

  const header = document.createElement('div');
  header.className = 'day-header';

  const dayName = document.createElement('h2');
  dayName.id = `day-${day.value}`;
  dayName.textContent = day.name;

  const shortName = document.createElement('span');
  shortName.textContent = day.short;
  shortName.setAttribute('aria-hidden', 'true');

  header.append(dayName, shortName);
  column.append(header);

  const dayEntries = scheduleEntries.filter((entry) => entry.day === day.value);
  if (dayEntries.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'day-empty';
    empty.textContent = 'Занятий нет';
    column.append(empty);
    return column;
  }

  const list = document.createElement('div');
  list.className = 'lesson-list';
  dayEntries.forEach((entry) => list.append(createScheduleCard(entry)));
  column.append(list);
  return column;
}

function getLessonCountText(count) {
  const lastTwoDigits = count % 100;
  const lastDigit = count % 10;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 14) {
    return `${count} занятий`;
  }
  if (lastDigit === 1) {
    return `${count} занятие`;
  }
  if (lastDigit >= 2 && lastDigit <= 4) {
    return `${count} занятия`;
  }
  return `${count} занятий`;
}

function renderSchedule() {
  schedule.replaceChildren();
  const selectedDay = Number(dayFilter.value);
  const visibleDays = selectedDay
    ? days.filter((day) => day.value === selectedDay)
    : days;

  visibleDays.forEach((day) => schedule.append(createDayColumn(day)));
  lessonCount.textContent = getLessonCountText(scheduleEntries.length);
  schedule.classList.toggle('single-day', Boolean(selectedDay));
  schedule.setAttribute('aria-busy', 'false');
}

async function loadSchedule() {
  schedule.setAttribute('aria-busy', 'true');
  const query = dayFilter.value ? `?day=${dayFilter.value}` : '';
  try {
    scheduleEntries = await apiRequest(`/api/schedule${query}`);
    renderSchedule();
  } catch (error) {
    scheduleEntries = [];
    schedule.replaceChildren();
    lessonCount.textContent = '';
    schedule.setAttribute('aria-busy', 'false');
    showNotice(error.message, 'error');
  }
}

function clearErrors() {
  form.querySelectorAll('.field-error').forEach((field) => {
    field.classList.remove('field-error');
    field.removeAttribute('aria-invalid');
  });
  form.querySelectorAll('small').forEach((message) => {
    message.textContent = '';
  });
  document.querySelector('#form-error').textContent = '';
}

function showFormErrors(error) {
  document.querySelector('#form-error').textContent = error.message;
  if (!error.fields) {
    return;
  }

  const inputIds = {
    subject: 'subject',
    teacher: 'teacher',
    room: 'room',
    day: 'day',
    start_time: 'start-time',
    end_time: 'end-time'
  };

  for (const [field, message] of Object.entries(error.fields)) {
    const input = document.querySelector(`#${inputIds[field]}`);
    const output = document.querySelector(`#${inputIds[field]}-error`);
    if (input && output) {
      input.classList.add('field-error');
      input.setAttribute('aria-invalid', 'true');
      output.textContent = message;
    }
  }

  form.querySelector('[aria-invalid="true"]')?.focus();
}

function openCreateDialog() {
  form.reset();
  entryId.value = '';
  if (dayFilter.value) {
    dayInput.value = dayFilter.value;
  }
  clearErrors();
  dialogTitle.textContent = 'Новое занятие';
  saveButton.textContent = 'Сохранить';
  dialogReturnFocus = addButton;
  dialog.showModal();
  subjectInput.focus();
}

function openEditDialog(id, trigger) {
  const entry = scheduleEntries.find((item) => item.id === id);
  if (!entry) {
    return;
  }

  clearErrors();
  entryId.value = entry.id;
  subjectInput.value = entry.subject;
  teacherInput.value = entry.teacher;
  roomInput.value = entry.room;
  dayInput.value = entry.day;
  startTimeInput.value = entry.start_time;
  endTimeInput.value = entry.end_time;
  dialogTitle.textContent = 'Изменить занятие';
  saveButton.textContent = 'Сохранить изменения';
  dialogReturnFocus = trigger;
  dialog.showModal();
  subjectInput.focus();
}

async function saveLesson(event) {
  event.preventDefault();
  clearErrors();

  const data = Object.fromEntries(new FormData(form));
  data.day = Number(data.day);
  const id = entryId.value;
  saveButton.disabled = true;
  saveButton.textContent = 'Сохраняю…';

  try {
    const saved = await apiRequest(id ? `/api/schedule/${id}` : '/api/schedule', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(data)
    });
    dialog.close();
    if (dayFilter.value && dayFilter.value !== String(saved.day)) {
      dayFilter.value = String(saved.day);
    }
    await loadSchedule();
    showNotice(id ? 'Занятие изменено' : 'Занятие добавлено');
  } catch (error) {
    showFormErrors(error);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = id ? 'Сохранить изменения' : 'Сохранить';
  }
}

async function deleteEntry(id) {
  const entry = scheduleEntries.find((item) => item.id === id);
  if (!entry || !window.confirm(`Удалить занятие «${entry.subject}»?`)) {
    return;
  }

  try {
    await apiRequest(`/api/schedule/${id}`, { method: 'DELETE' });
    await loadSchedule();
    showNotice('Занятие удалено');
  } catch (error) {
    showNotice(error.message, 'error');
  }
}

addButton.addEventListener('click', openCreateDialog);
closeDialogButton.addEventListener('click', () => dialog.close());
cancelButton.addEventListener('click', () => dialog.close());
dayFilter.addEventListener('change', loadSchedule);
form.addEventListener('submit', saveLesson);
dialog.addEventListener('close', () => {
  const target = document.contains(dialogReturnFocus) ? dialogReturnFocus : addButton;
  target.focus();
});

schedule.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) {
    return;
  }

  const id = Number(button.dataset.id);
  if (button.dataset.action === 'edit') {
    openEditDialog(id, button);
  } else if (button.dataset.action === 'delete') {
    deleteEntry(id);
  }
});

loadSchedule();
