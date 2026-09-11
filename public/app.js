const days = [
  { value: 1, name: 'Понедельник', short: 'Пн' },
  { value: 2, name: 'Вторник', short: 'Вт' },
  { value: 3, name: 'Среда', short: 'Ср' },
  { value: 4, name: 'Четверг', short: 'Чт' },
  { value: 5, name: 'Пятница', short: 'Пт' },
  { value: 6, name: 'Суббота', short: 'Сб' },
  { value: 7, name: 'Воскресенье', short: 'Вс' }
];

const schedule = document.querySelector('#schedule');
const dayFilter = document.querySelector('#day-filter');
const lessonCount = document.querySelector('#lesson-count');
const notice = document.querySelector('#notice');
const dialog = document.querySelector('#lesson-dialog');
const form = document.querySelector('#lesson-form');
const dialogTitle = document.querySelector('#dialog-title');
const saveButton = document.querySelector('#save-button');
const lessonId = document.querySelector('#lesson-id');
const titleInput = document.querySelector('#title');
const dayInput = document.querySelector('#day');
const startTimeInput = document.querySelector('#start-time');
const endTimeInput = document.querySelector('#end-time');
const cabinetInput = document.querySelector('#cabinet');
const colorInput = document.querySelector('#color');

let lessons = [];
let noticeTimer;

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

function createLessonCard(lesson) {
  const card = document.createElement('article');
  card.className = 'lesson-card';
  card.style.setProperty('--lesson-color', lesson.color);

  const time = document.createElement('p');
  time.className = 'lesson-time';
  time.textContent = `${lesson.start_time}–${lesson.end_time}`;

  const title = document.createElement('h3');
  title.textContent = lesson.title;

  const cabinet = document.createElement('p');
  cabinet.className = 'lesson-cabinet';
  cabinet.textContent = lesson.cabinet;

  const actions = document.createElement('div');
  actions.className = 'lesson-actions';

  const editButton = document.createElement('button');
  editButton.type = 'button';
  editButton.className = 'text-button';
  editButton.dataset.action = 'edit';
  editButton.dataset.id = lesson.id;
  editButton.textContent = 'Изменить';
  editButton.setAttribute('aria-label', `Изменить занятие «${lesson.title}»`);

  const deleteButton = document.createElement('button');
  deleteButton.type = 'button';
  deleteButton.className = 'text-button danger-button';
  deleteButton.dataset.action = 'delete';
  deleteButton.dataset.id = lesson.id;
  deleteButton.textContent = 'Удалить';
  deleteButton.setAttribute('aria-label', `Удалить занятие «${lesson.title}»`);

  actions.append(editButton, deleteButton);
  card.append(time, title, cabinet, actions);
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

  const dayLessons = lessons.filter((lesson) => lesson.day === day.value);
  if (dayLessons.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'day-empty';
    empty.textContent = 'Занятий нет';
    column.append(empty);
    return column;
  }

  const list = document.createElement('div');
  list.className = 'lesson-list';
  dayLessons.forEach((lesson) => list.append(createLessonCard(lesson)));
  column.append(list);
  return column;
}

function renderSchedule() {
  schedule.replaceChildren();
  const selectedDay = Number(dayFilter.value);
  const visibleDays = selectedDay
    ? days.filter((day) => day.value === selectedDay)
    : days;

  visibleDays.forEach((day) => schedule.append(createDayColumn(day)));
  lessonCount.textContent = lessons.length === 1
    ? '1 занятие'
    : `${lessons.length} занятий`;
  schedule.classList.toggle('single-day', Boolean(selectedDay));
  schedule.setAttribute('aria-busy', 'false');
}

async function loadLessons() {
  schedule.setAttribute('aria-busy', 'true');
  const query = dayFilter.value ? `?day=${dayFilter.value}` : '';
  try {
    lessons = await apiRequest(`/api/lessons${query}`);
    renderSchedule();
  } catch (error) {
    lessons = [];
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
    title: 'title',
    day: 'day',
    start_time: 'start-time',
    end_time: 'end-time',
    cabinet: 'cabinet',
    color: 'color'
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
  lessonId.value = '';
  colorInput.value = '#3768b5';
  if (dayFilter.value) {
    dayInput.value = dayFilter.value;
  }
  clearErrors();
  dialogTitle.textContent = 'Новое занятие';
  saveButton.textContent = 'Сохранить';
  dialog.showModal();
  titleInput.focus();
}

function openEditDialog(id) {
  const lesson = lessons.find((item) => item.id === id);
  if (!lesson) {
    return;
  }

  clearErrors();
  lessonId.value = lesson.id;
  titleInput.value = lesson.title;
  dayInput.value = lesson.day;
  startTimeInput.value = lesson.start_time;
  endTimeInput.value = lesson.end_time;
  cabinetInput.value = lesson.cabinet;
  colorInput.value = lesson.color;
  dialogTitle.textContent = 'Изменить занятие';
  saveButton.textContent = 'Сохранить изменения';
  dialog.showModal();
  titleInput.focus();
}

async function saveLesson(event) {
  event.preventDefault();
  clearErrors();

  const data = Object.fromEntries(new FormData(form));
  data.day = Number(data.day);
  const id = lessonId.value;
  saveButton.disabled = true;
  saveButton.textContent = 'Сохраняю…';

  try {
    const saved = await apiRequest(id ? `/api/lessons/${id}` : '/api/lessons', {
      method: id ? 'PUT' : 'POST',
      body: JSON.stringify(data)
    });
    dialog.close();
    if (dayFilter.value && dayFilter.value !== String(saved.day)) {
      dayFilter.value = String(saved.day);
    }
    await loadLessons();
    showNotice(id ? 'Занятие изменено' : 'Занятие добавлено');
  } catch (error) {
    showFormErrors(error);
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = id ? 'Сохранить изменения' : 'Сохранить';
  }
}

async function deleteLesson(id) {
  const lesson = lessons.find((item) => item.id === id);
  if (!lesson || !window.confirm(`Удалить занятие «${lesson.title}»?`)) {
    return;
  }

  try {
    await apiRequest(`/api/lessons/${id}`, { method: 'DELETE' });
    await loadLessons();
    showNotice('Занятие удалено');
  } catch (error) {
    showNotice(error.message, 'error');
  }
}

document.querySelector('#add-button').addEventListener('click', openCreateDialog);
document.querySelector('#close-dialog').addEventListener('click', () => dialog.close());
document.querySelector('#cancel-button').addEventListener('click', () => dialog.close());
dayFilter.addEventListener('change', loadLessons);
form.addEventListener('submit', saveLesson);

schedule.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) {
    return;
  }

  const id = Number(button.dataset.id);
  if (button.dataset.action === 'edit') {
    openEditDialog(id);
  } else if (button.dataset.action === 'delete') {
    deleteLesson(id);
  }
});

loadLessons();
