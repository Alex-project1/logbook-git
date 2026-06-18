# Route Master — Project Handoff / Инструкция для продолжения разработки

Этот файл нужен, чтобы открыть новый GPT-чат и быстро передать ему весь контекст проекта: архитектуру, текущие домены, правила деплоя, важные файлы, уже найденные проблемы, исправления и дальнейшие задачи.

---

## 1. Кратко о проекте

**Route Master** — система для учёта охранных смен.

Проект состоит из трёх частей:

```text
logbook-git/
├─ backend/   — Node.js + TypeScript + Express + Prisma + MySQL
├─ admin/     — React + Vite админ-панель
└─ mobile/    — Android Kotlin + Jetpack Compose приложение
```

Основные сценарии:

- Админка ведёт города, подразделения, сотрудников, автомобили, наряды ГШР, посты, пользователей, уведомления, отчёты.
- Android-приложение используется нарядами ГШР и постами.
- Наряд ГШР заполняет смену, маршруты/поездки, пробег, сработки, задержанных/переданных.
- Пост заполняет постовое дежурство, сотрудников, авто, длительность.
- Backend принимает данные, сохраняет в MySQL, строит отчёты и отдаёт историю.
- Есть Firebase push-уведомления.
- Есть offline-очередь Android: если нет интернета, смена/пост сохраняется локально и отправляется позже.
- Есть черновик формы смены: данные сохраняются локально и восстанавливаются после сворачивания/закрытия приложения.

---

## 2. Текущие production-домены и URL

Текущий API-домен:

```text
https://api.avdemo.uk
```

Админка должна ходить на API через:

```env
VITE_API_URL=https://api.avdemo.uk
```

Android должен ходить на API через:

```kotlin
private const val BASE_URL = "https://api.avdemo.uk/"
```

Backend сам публичный домен обычно не знает. Он слушает локальный порт, например:

```env
PORT=5000
```

А Nginx проксирует:

```text
https://api.avdemo.uk → http://127.0.0.1:5000
```

---

## 3. Backend

### 3.1. Технологии

- Node.js
- TypeScript
- Express
- Prisma
- MySQL
- Firebase Admin SDK
- ExcelJS для Excel-отчётов
- JWT авторизация

### 3.2. Главные backend-файлы

```text
backend/package.json
backend/prisma/schema.prisma
backend/seed-system-foundation.js
backend/src/server.ts
backend/src/app.ts
backend/src/modules/
```

В `backend/package.json` Prisma seed подключён так:

```json
"prisma": {
  "seed": "node -r dotenv/config seed-system-foundation.js"
}
```

Значит команда:

```bash
npx prisma db seed
```

запускает:

```text
backend/seed-system-foundation.js
```

### 3.3. Backend `.env`

Файл на сервере:

```text
/var/www/route-master/backend/.env
```

Пример структуры:

```env
NODE_ENV=production
PORT=5000

DATABASE_URL="mysql://route_master_user:MYSQL_PASSWORD@localhost:3306/route_master"

JWT_SECRET="LONG_RANDOM_SECRET"
JWT_EXPIRES_IN="7d"

ADMIN_JWT_SECRET="LONG_RANDOM_ADMIN_SECRET"
ADMIN_JWT_EXPIRES_IN="7d"

MOBILE_JWT_SECRET="LONG_RANDOM_MOBILE_SECRET"
MOBILE_JWT_EXPIRES_IN="30d"

PUSH_ENABLED="true"
FIREBASE_PROJECT_ID="routmaster-4302b"
GOOGLE_APPLICATION_CREDENTIALS="/var/www/route-master/secrets/firebase-adminsdk.json"

OBJECTS_API_BASE_URL="https://l-cs.ohholding.com.ua"
OBJECTS_API_AUTH_HEADER="Basic REAL_TOKEN_HERE"

OBJECTS_CITY_REGION_MAP='{"1":{"externalRegionId":2,"lat":47.8388,"lng":35.1396},"2":{"externalRegionId":3,"lat":48.4647,"lng":35.0462},"3":{"externalRegionId":8,"lat":47.9105,"lng":33.3918},"4":{"externalRegionId":1,"lat":50.4501,"lng":30.5234},"5":{"externalRegionId":5,"lat":48.5321,"lng":35.87},"6":{"externalRegionId":6,"lat":48.511339,"lng":34.602103},"7":{"externalRegionId":4,"lat":49.8397,"lng":24.0297}}'

SEED_ADMIN_PASSWORD="CHANGE_ME"
```

Важно:

```text
OBJECTS_API_AUTH_HEADER обязательно должен начинаться с Basic + пробел.
```

Правильно:

```env
OBJECTS_API_AUTH_HEADER="Basic YS5..."
```

Неправильно:

```env
OBJECTS_API_AUTH_HEADER="YS5..."
```

### 3.4. Firebase Admin SDK

Файл Firebase Admin SDK должен лежать на сервере здесь:

```text
/var/www/route-master/secrets/firebase-adminsdk.json
```

Права:

```bash
mkdir -p /var/www/route-master/secrets
chmod 700 /var/www/route-master/secrets
chmod 600 /var/www/route-master/secrets/firebase-adminsdk.json
```

В `.env`:

```env
GOOGLE_APPLICATION_CREDENTIALS="/var/www/route-master/secrets/firebase-adminsdk.json"
```

### 3.5. Prisma и обновление БД

В проекте Prisma schema менялась. Если старые данные можно потерять, самый простой и безопасный вариант при деплое:

```bash
cd /var/www/route-master/backend
npm ci
npx prisma validate
npx prisma db push --force-reset --accept-data-loss
npx prisma generate
npx prisma db seed
npm run build
```

`db push --force-reset` удаляет старую структуру БД и создаёт новую по текущему `schema.prisma`.

Не использовать как основной вариант:

```bash
npx prisma migrate deploy
```

Причина: миграции в проекте могут не полностью соответствовать текущему `schema.prisma`.

### 3.6. Seed

Текущий seed `seed-system-foundation.js` создаёт базовый фундамент:

```text
admin user
roles
permissions
cities
departments / ГШР
admin city access
admin department access
trip goals
additional alarm reasons
```

Важно: если seed не был дополнен, он может НЕ создавать:

```text
сотрудников
aвтомобили
наряды / позывные
посты
mobile users для Android
```

Их нужно создать вручную в админке или дописать seed.

---

## 4. Admin web

### 4.1. Технологии

- React
- Vite
- TypeScript
- Axios
- React Router

### 4.2. Главные файлы админки

```text
admin/package.json
admin/src/App.tsx
admin/src/api/http.ts
admin/src/api/*.api.ts
admin/src/pages/
admin/src/pages/reports/
admin/src/styles/global.css
admin/public/logo.webp
```

### 4.3. Admin API URL

Файл:

```text
admin/src/api/http.ts
```

Правильный вариант:

```ts
import axios from "axios";

const API_URL = import.meta.env.VITE_API_URL || "https://api.avdemo.uk";

export const http = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});
```

Файл на сервере:

```text
/var/www/route-master/admin/.env
```

Должно быть:

```env
VITE_API_URL=https://api.avdemo.uk
```

После изменения `.env` админки обязательно пересобрать:

```bash
cd /var/www/route-master/admin
npm run build
nginx -t
systemctl reload nginx
```

### 4.4. Проверка, что админка не смотрит в localhost

```bash
cd /var/www/route-master/admin
grep -R "localhost:5000\|127.0.0.1:5000\|10.0.2.2:5000" -n dist build 2>/dev/null
```

Если ничего не вывело — хорошо.

### 4.5. Логотип в admin/public

Если логотип лежит здесь:

```text
/var/www/route-master/admin/public/logo.webp
```

То в CSS путь должен быть:

```css
background-image: url("/logo.webp");
```

Не так:

```css
background-image: url(./public/logo.webp);
background-image: url(./logo.webp);
```

После изменения:

```bash
cd /var/www/route-master/admin
npm run build
nginx -t
systemctl reload nginx
```

Проверка:

```bash
ls -lah /var/www/route-master/admin/dist/logo.webp
```

И в браузере:

```text
https://АДМИН-ДОМЕН/logo.webp
```

### 4.6. Баг `Місто #undefined · ГШР`

Если в колонке `Підрозділ` показывается:

```text
Місто #undefined · ГШР
```

то проблема во frontend-форматировании, не в БД.

Файл:

```text
admin/src/utils/department-options.ts
```

Функция `formatDepartmentOption` должна не добавлять `Місто #undefined`, если `cityId` не пришёл.

Рекомендуемый вариант:

```ts
export function formatDepartmentOption(
  department: Pick<Department, "id" | "name" | "type"> & {
    cityId?: number;
    city?: { id: number; name: string };
  },
  options?: { showCity?: boolean; showType?: boolean },
) {
  const showCity = Boolean(options?.showCity);
  const showType = options?.showType !== false;

  const parts: string[] = [];

  if (showCity) {
    const cityLabel = department.city?.name || (department.cityId ? `Місто #${department.cityId}` : "");

    if (cityLabel) {
      parts.push(cityLabel);
    }
  }

  parts.push(department.name);

  if (showType && department.type !== "GBR") {
    parts.push(getDepartmentTypeLabel(department.type));
  }

  return parts.join(" · ");
}
```

После изменения:

```bash
cd /var/www/route-master/admin
npm run build
nginx -t
systemctl reload nginx
```

### 4.7. Пагинация сотрудников

Для страницы сотрудников был подготовлен файл:

```text
EmployeesPage_with_pagination.tsx
```

Его нужно класть сюда:

```text
admin/src/pages/EmployeesPage.tsx
```

Что он добавляет:

```text
page
pageSize
totalPages
paginatedEmployees
выбор 20 / 50 / 100 строк
Назад / Вперед
сброс на страницу 1 после фильтров и изменений
```

Это frontend-пагинация: backend всё ещё отдаёт список, а React режет его через `slice`.

---

## 5. Android mobile

### 5.1. Технологии

- Kotlin
- Jetpack Compose
- Retrofit
- Gson
- DataStore
- WorkManager
- Firebase Messaging

### 5.2. Главные Android-файлы

```text
mobile/app/src/main/java/com/oh/routemaster/data/remote/ApiClient.kt
mobile/app/src/main/java/com/oh/routemaster/data/remote/RouteMasterApi.kt
mobile/app/src/main/java/com/oh/routemaster/data/remote/ApiModels.kt
mobile/app/src/main/java/com/oh/routemaster/data/local/ShiftDraftStore.kt
mobile/app/src/main/java/com/oh/routemaster/data/local/PendingSubmissionStore.kt
mobile/app/src/main/java/com/oh/routemaster/ui/screens/NewShiftScreen.kt
mobile/app/src/main/java/com/oh/routemaster/ui/screens/HistoryScreen.kt
mobile/app/src/main/java/com/oh/routemaster/ui/screens/ObjectsScreen.kt
mobile/app/src/main/java/com/oh/routemaster/ui/screens/NotificationsScreen.kt
```

### 5.3. Android API URL

Файл:

```text
mobile/app/src/main/java/com/oh/routemaster/data/remote/ApiClient.kt
```

Для production:

```kotlin
private const val BASE_URL = "https://api.avdemo.uk/"
```

Не должно быть:

```kotlin
private const val BASE_URL = "http://127.0.0.1:5000/"
private const val BASE_URL = "http://10.0.2.2:5000/"
```

### 5.4. Android Objects / Leaflet

Файл:

```text
mobile/app/src/main/java/com/oh/routemaster/ui/screens/ObjectsScreen.kt
```

Нужно проверить:

```kotlin
private const val OBJECTS_WEB_BASE_URL = "https://api.avdemo.uk/"
private const val OBJECTS_WEB_HOST = "api.avdemo.uk"
```

И в `loadDataWithBaseURL`:

```kotlin
loadDataWithBaseURL(
    "https://api.avdemo.uk/",
    html,
    "text/html",
    "UTF-8",
    null
)
```

Если там остался `127.0.0.1`, телефон будет искать Leaflet у себя и может быть ошибка:

```text
Leaflet is not loaded
```

### 5.5. Проверка hardcoded localhost

Из корня проекта:

```bash
grep -R "localhost:5000\|127.0.0.1:5000\|10.0.2.2:5000" -n admin/src admin/.env* backend/src backend/.env* mobile/app/src/main 2>/dev/null
```

В production этого быть не должно.

### 5.6. NewShiftScreen — уже внесённые важные правки

Файл:

```text
mobile/app/src/main/java/com/oh/routemaster/ui/screens/NewShiftScreen.kt
```

Были сделаны/подготовлены правки:

1. Исправление ошибки `Invalid shiftDate`.
   - Причина была в времени вида `8:55` вместо `08:55`.
   - Добавлена нормализация через `buildIsoDateTime(date, time)`.

2. Даты отправляются так:

```kotlin
shiftDate = buildIsoDateTime(shiftDate, shiftTime)
departureTime = buildIsoDateTime(shiftDate, trip.departureTime)
arrivalTime = buildIsoDateTime(shiftDate, trip.arrivalTime)
dutyDate = buildIsoDateTime(postDate, postTime)
```

3. Время начала смены и поста лучше выбирать через `TimeSelectField`, а не вводить руками.

4. При добавлении новой поездки поле `Звідки` заполняется из `Куди` предыдущей поездки:

```kotlin
val previousTrip = trips.lastOrNull()
val newTrip = TripDraft(
    localId = nextTripId,
    goalId = 0,
    fromLocation = previousTrip?.toLocation?.trim().orEmpty(),
    departureTime = getCurrentTimeInput()
)
```

5. Если приложение свернули и открыли снова — черновик должен восстановиться автоматически, без окна `Відновити / Почати заново`.

6. Добавлена кнопка:

```text
Скинути зміну і почати заново
```

7. Сохраняется открытое место формы:
   - открытые секции;
   - открытая поездка;
   - позиция scroll.

8. Если время прибытия выбрано меньше или равно времени выезда, оно исправляется на `выезд + 1 минута`:

```kotlin
if (
    departureMinutes != null &&
    arrivalMinutes != null &&
    arrivalMinutes <= departureMinutes
) {
    onChangeArrivalTime(formatMinutesToTime(departureMinutes + 1))
}
```

9. В блок `Маршрути / Поїздки` добавлен `Спідометр кінець`, как в `Перевірка зміни`.

Функция subtitle может быть такой:

```kotlin
private fun buildTripsSectionSubtitle(
    trips: List<TripDraft>,
    odometerStart: String
): String {
    if (trips.isEmpty()) {
        return "Поїздки ще не додані"
    }

    val odometerStartNumber = odometerStart.toDoubleOrNull()
    val odometerEndLabel = if (odometerStartNumber == null) {
        "Не вказано"
    } else {
        "${formatDistanceValue(odometerStartNumber + calculateTripsDistanceKm(trips))} км"
    }

    return "· Додано поїздок: ${trips.size}\n· Спідометр кінець: $odometerEndLabel"
}
```

Использовать в `AccordionSection`:

```kotlin
subtitle = if (shiftKind == ShiftKind.GBR) {
    buildTripsSectionSubtitle(
        trips = trips,
        odometerStart = odometerStart
    )
} else {
    "Додано співробітників: ${postMembers.count { it.employeeId > 0 }}"
}
```

### 5.7. Сборка Android APK

На компьютере:

```powershell
cd C:\Users\administrator\Desktop\myProj\OH\logbook-git\mobile
.\gradlew.bat clean
.\gradlew.bat assembleRelease
```

APK:

```text
mobile/app/build/outputs/apk/release/app-release.apk
```

Установка:

```powershell
adb uninstall com.oh.routemaster
adb install ".\app\build\outputs\apk\release\app-release.apk"
```

### 5.8. Файлы Android, которые нельзя коммитить

```text
mobile/app/google-services.json
keystore.properties
*.jks
```

---

## 6. Deploy / обновление сервера через FileZilla + SSH

Текущий сервер уже работает: admin + backend. Нужно обновлять код, не трогая `.env`, `secrets`, Nginx и домены.

### 6.1. Что обновлять

Backend обновлять полностью, кроме:

```text
backend/.env
backend/node_modules
backend/dist
```

Admin обновлять полностью, кроме:

```text
admin/.env
admin/node_modules
admin/dist
admin/build
```

### 6.2. Подготовка файлов на компьютере

Создать локальную папку:

```text
C:\route-master-update
```

Внутри:

```text
C:\route-master-update\backend
C:\route-master-update\admin
```

Не класть туда:

```text
.env
node_modules
dist
build
.git
secrets
firebase-adminsdk.json
google-services.json
*.jks
keystore.properties
```

### 6.3. Загрузка через FileZilla

В FileZilla подключиться по SFTP:

```text
Host: sftp://IP_СЕРВЕРА
Username: root
Port: 22
```

Создать на сервере временную папку:

```text
/var/www/route-master-update
```

Загрузить туда:

```text
backend
admin
```

Должно получиться:

```text
/var/www/route-master-update/backend
/var/www/route-master-update/admin
```

### 6.4. SSH-команды после загрузки

Зайти на сервер:

```powershell
ssh root@IP_СЕРВЕРА
```

Проверить загрузку:

```bash
ls -la /var/www/route-master-update
ls -la /var/www/route-master-update/backend
ls -la /var/www/route-master-update/admin
```

Backup `.env` и кода:

```bash
mkdir -p /root/route-master-backup

cp /var/www/route-master/backend/.env /root/route-master-backup/backend.env.$(date +%F_%H-%M)
cp /var/www/route-master/admin/.env /root/route-master-backup/admin.env.$(date +%F_%H-%M) 2>/dev/null || true

tar -czf /root/route-master-backup/code-before-update-$(date +%F_%H-%M).tar.gz /var/www/route-master
```

Если сервер 1 GB RAM — добавить swap один раз:

```bash
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

free -h
```

Остановить backend:

```bash
pm2 stop route-master-backend || true
pm2 list
```

Обновить файлы:

```bash
rsync -a --delete \
  --exclude='.env' \
  --exclude='node_modules' \
  --exclude='dist' \
  /var/www/route-master-update/backend/ /var/www/route-master/backend/

rsync -a --delete \
  --exclude='.env' \
  --exclude='node_modules' \
  --exclude='dist' \
  --exclude='build' \
  /var/www/route-master-update/admin/ /var/www/route-master/admin/

rm -rf /var/www/route-master/backend/dist
rm -rf /var/www/route-master/admin/dist
```

Проверить `.env`:

```bash
cat /var/www/route-master/backend/.env
cat /var/www/route-master/admin/.env
```

Admin `.env` должен быть:

```env
VITE_API_URL=https://api.avdemo.uk
```

Если там localhost:

```bash
cat > /var/www/route-master/admin/.env <<'EOF'
VITE_API_URL=https://api.avdemo.uk
EOF
```

Backend build + Prisma reset:

```bash
cd /var/www/route-master/backend
npm ci
npx prisma validate
npx prisma db push --force-reset --accept-data-loss
npx prisma generate
npx prisma db seed
npm run build
```

Запуск backend:

```bash
cd /var/www/route-master/backend
pm2 restart route-master-backend --update-env || pm2 start dist/server.js --name route-master-backend --update-env
pm2 save
```

Admin build:

```bash
cd /var/www/route-master/admin
npm ci
npm run build
```

Проверка сборки admin:

```bash
grep -R "localhost:5000\|127.0.0.1:5000\|10.0.2.2:5000" -n dist build 2>/dev/null
```

Nginx reload:

```bash
nginx -t
systemctl reload nginx
```

Если Nginx раздаёт админку из другой папки, например `/var/www/admin.avdemo.uk`, надо скопировать build:

```bash
rsync -a --delete /var/www/route-master/admin/dist/ /var/www/admin.avdemo.uk/
nginx -t
systemctl reload nginx
```

Финальные проверки:

```bash
curl https://api.avdemo.uk/api/health

curl -I https://api.avdemo.uk/api/mobile/objects/map-assets/leaflet.js
curl -I https://api.avdemo.uk/api/mobile/objects/map-assets/leaflet.css

pm2 logs route-master-backend --lines 100 --nostream
```

Очистить временную папку после успешного деплоя:

```bash
rm -rf /var/www/route-master-update
```

---

## 7. Проверки после deploy

### Backend health

```bash
curl https://api.avdemo.uk/api/health
```

### Admin login

```bash
curl -i -X POST https://api.avdemo.uk/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"login":"admin","password":"SEED_ADMIN_PASSWORD"}'
```

### Mobile login

```bash
curl -i -X POST https://api.avdemo.uk/api/mobile/login \
  -H "Content-Type: application/json" \
  -d '{"login":"MOBILE_LOGIN","password":"MOBILE_PASSWORD"}'
```

### Leaflet assets

```bash
curl -I https://api.avdemo.uk/api/mobile/objects/map-assets/leaflet.js
curl -I https://api.avdemo.uk/api/mobile/objects/map-assets/leaflet.css
```

Должно быть `200`.

### Внешний API объектов

```bash
cd /var/www/route-master/backend

node -r dotenv/config <<'NODE'
async function main() {
  const url = `${process.env.OBJECTS_API_BASE_URL}/api/v2/object-card/coordinate/by-region/2`;

  const response = await fetch(url, {
    headers: {
      Authorization: process.env.OBJECTS_API_AUTH_HEADER,
      Accept: 'application/json',
    },
  });

  const text = await response.text();

  console.log('STATUS:', response.status);
  console.log(text.slice(0, 500));
}

main().catch(console.error);
NODE
```

Если токен правильный — `STATUS: 200`.

---

## 8. Отчёты и Excel

### 8.1. Как данные грузятся в админке

В отчётах большие таблицы в основном показывают текущую страницу:

```text
Маршрути / Поїздки
Зміни
Співробітники
Наряди
Автомобілі
```

Но есть нюанс:

- `Маршрути` и `Зміни` — нормальная серверная пагинация через `skip/take`.
- `Співробітники`, `Наряди`, `Автомобілі` — backend может сначала агрегировать до 10 000 записей, потом отдаёт страницу.
- Справочники (`employees`, `vehicles`, `crews`, `cities`, `departments`) обычно грузятся целиком.
- Выпадающие списки в отчётах тоже грузятся целиком.

### 8.2. Отличия Excel от таблиц админки

Главный риск: некоторые Excel-выгрузки могут не учитывать `departmentId` и права доступа по подразделениям так же, как таблицы.

Больше всего отличается:

```text
Загальна статистика
```

В админке есть:

```text
Статистика за містами
Додаткові спрацювання
```

А Excel может выгружать другой набор листов:

```text
Общая статистика
Сотрудники
Постовые дежурства
Наряды
Автомобили
```

Средне отличаются:

```text
Маршрути
Зміни
Співробітники
Автомобілі
Спрацювання
```

Ближе всего совпадают:

```text
Наряди
Користувацький звіт
```

Но даже там есть отличия: дополнительные листы, язык заголовков, выгрузка всех строк вместо текущей страницы.

---

## 9. Telegram-отчёты — план реализации

Пользователь хочет из Android-истории отправлять краткий отчёт по наряду ГШР или посту в Telegram.

Бот уже есть, chat_id каналов есть.

Правильная архитектура:

```text
Android → backend → Telegram Bot API
```

Нельзя класть Telegram bot token в APK.

### 9.1. Backend `.env`

Пример:

```env
TELEGRAM_ENABLED="true"
TELEGRAM_BOT_TOKEN="123456:ABCDEF..."
TELEGRAM_GBR_CHAT_ID="-1001234567890"
TELEGRAM_POST_CHAT_ID="-1009876543210"
```

Если по городам:

```env
TELEGRAM_GBR_CITY_CHAT_MAP='{"1":"-1001111111111","2":"-1002222222222"}'
TELEGRAM_POST_CITY_CHAT_MAP='{"1":"-1009999999999","2":"-1008888888888"}'
```

### 9.2. Backend endpoints

Рекомендуемые endpoint-и:

```text
POST /api/mobile/history/gbr-shifts/:id/send-telegram
POST /api/mobile/history/post-duties/:id/send-telegram
```

Backend должен:

```text
1. Проверить JWT mobile user.
2. Проверить доступ к смене/посту.
3. Достать отчёт из БД.
4. Сформировать текст сам, не доверять Android-тексту.
5. Выбрать chat_id.
6. Отправить sendMessage в Telegram.
7. Вернуть Android результат.
```

### 9.3. Защита от дублей

Можно добавить таблицу:

```prisma
model TelegramReportLog {
  id                 Int      @id @default(autoincrement())
  reportType         String
  entityId           Int
  chatId             String
  messageId          String?
  sentByMobileUserId Int?
  sentAt             DateTime @default(now())

  @@unique([reportType, entityId, chatId])
}
```

---

## 10. Сервер и ресурсы

Текущий минимальный сервер:

```text
1 GB RAM
20 GB SSD
```

Для текущей нагрузки:

```text
6 нарядов ГШР каждый день
1 пост каждый день
```

сервер подходит, но это минимальный вариант.

Главные риски:

```text
1 GB RAM мало для npm build + MySQL + Node + PM2 + Nginx
20 GB SSD требует чистить backup и logs
```

Обязательно добавить swap:

```bash
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
free -h
```

Лучше для спокойной работы:

```text
2 GB RAM
40 GB SSD
```

---

## 11. Что нельзя коммитить в git

```text
backend/.env
admin/.env
mobile/app/google-services.json
/var/www/route-master/secrets/firebase-adminsdk.json
keystore.properties
*.jks
```

---

## 12. Частые проблемы и быстрые решения

### Админка отправляет запросы на localhost

Проверить:

```bash
cat /var/www/route-master/admin/.env
```

Должно быть:

```env
VITE_API_URL=https://api.avdemo.uk
```

Пересобрать:

```bash
cd /var/www/route-master/admin
npm run build
nginx -t
systemctl reload nginx
```

В браузере `Ctrl + F5`.

### Android не логинится

Проверить:

```text
mobile/app/src/main/java/com/oh/routemaster/data/remote/ApiClient.kt
```

Должно быть:

```kotlin
private const val BASE_URL = "https://api.avdemo.uk/"
```

И проверить, что mobile user создан в админке.

### Карта пишет `Leaflet is not loaded`

Проверить:

```text
mobile/app/src/main/java/com/oh/routemaster/ui/screens/ObjectsScreen.kt
```

Должно быть:

```kotlin
loadDataWithBaseURL("https://api.avdemo.uk/", ...)
```

Потом пересобрать APK.

### Карта даёт HTTP 500

Проверить backend `.env`:

```env
OBJECTS_API_AUTH_HEADER="Basic ..."
OBJECTS_CITY_REGION_MAP='...'
```

Логи:

```bash
pm2 flush route-master-backend
pm2 restart route-master-backend --update-env
pm2 logs route-master-backend --lines 100 --nostream
```

### Уведомления не отправляются

Проверить:

```text
/var/www/route-master/secrets/firebase-adminsdk.json
backend/.env GOOGLE_APPLICATION_CREDENTIALS
PUSH_ENABLED="true"
```

Перезапуск:

```bash
pm2 restart route-master-backend --update-env
```

### `Invalid shiftDate` при отправке смены

Причина: время вида `8:55` вместо `08:55`.

Исправление в Android:

```kotlin
private fun buildIsoDateTime(
    date: String,
    time: String
): String {
    val normalizedTime = parseTimeToMinutes(time)
        ?.let { formatMinutesToTime(it) }
        ?: time.trim()

    return "${date.trim()}T${normalizedTime}:00.000Z"
}
```

Использовать для `shiftDate`, `departureTime`, `arrivalTime`, `dutyDate`.

Дополнительно желательно на backend сделать parseDate терпимее:

```ts
function parseDate(value: string) {
  const normalizedValue = value
    .trim()
    .replace(/T(\d):(\d{2})/, "T0$1:$2");

  const date = new Date(normalizedValue);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}
```

---

## 13. Короткий prompt для нового GPT-чата

Скопируй это в новый чат вместе с этим файлом:

```text
У меня проект Route Master: backend Node.js/Express/Prisma/MySQL, admin React/Vite, Android Kotlin/Jetpack Compose. Backend и admin уже работают на сервере /var/www/route-master, API домен https://api.avdemo.uk. Данные можно пересоздавать через npx prisma db push --force-reset --accept-data-loss и npx prisma db seed. Не трогать .env, secrets, node_modules, dist. Android использует ApiClient BASE_URL https://api.avdemo.uk/. В NewShiftScreen уже есть правки: buildIsoDateTime, TimePicker, автосохранение черновика, автоподстановка Звідки из предыдущего Куди, reset button, arrivalTime = departure + 1 min, спідометр кінець в subtitle. Нужно продолжать разработку с учётом файла route_master_project_handoff.md.
```

---

## 14. Текущие рабочие артефакты, созданные в чате

В текущем чате были подготовлены файлы:

```text
NewShiftScreen.kt
NewShiftScreen_final.kt
NewShiftScreen_with_odometer_subtitle.kt
EmployeesPage_with_pagination.tsx
```

Куда класть:

```text
NewShiftScreen*.kt → mobile/app/src/main/java/com/oh/routemaster/ui/screens/NewShiftScreen.kt
EmployeesPage_with_pagination.tsx → admin/src/pages/EmployeesPage.tsx
```

После замены Android-файла — пересобрать APK.
После замены admin-файла — `npm run build` и reload Nginx.

---

## 15. Мини-чеклист перед любым deploy

```text
1. Проверить admin/.env: VITE_API_URL=https://api.avdemo.uk
2. Проверить backend/.env: DATABASE_URL, JWT, Firebase, OBJECTS_API...
3. Проверить Android ApiClient.kt: BASE_URL=https://api.avdemo.uk/
4. Проверить ObjectsScreen.kt: loadDataWithBaseURL("https://api.avdemo.uk/", ...)
5. Не загружать .env, secrets, node_modules, dist, build
6. Backup .env и кода
7. pm2 stop route-master-backend
8. rsync backend/admin с exclude
9. backend: npm ci → prisma validate → db push --force-reset → generate → seed → build
10. pm2 restart/start
11. admin: npm ci → npm run build
12. nginx -t && systemctl reload nginx
13. Проверить /api/health, login, Leaflet assets
14. Ctrl + F5 в браузере
```
