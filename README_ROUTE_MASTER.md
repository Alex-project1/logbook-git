# Route Master — README / Project Handoff

Этот файл нужен, чтобы быстро поднять проект, собрать Android APK и продолжить разработку в новом чате без потери контекста.

---

## 1. Что это за проект

**Route Master** — система для охранных смен.

В проекте есть:

- **Backend**: Node.js + TypeScript + Express + Prisma + MySQL.
- **Admin web**: админская часть проекта, где ведутся справочники, уведомления, смены, посты, отчеты.
- **Android mobile**: Kotlin + Jetpack Compose приложение для сотрудников.
- **Firebase Cloud Messaging**: push-уведомления админка → телефон.
- **Offline queue**: если нет связи, смена/пост сохраняется в очередь и отправляется позже через WorkManager.
- **Drafts**: незавершенная форма смены сохраняется локально и восстанавливается после закрытия приложения.

---

## 2. Основная структура проекта

```text
logbook-git/
├─ backend/
│  ├─ prisma/schema.prisma
│  ├─ src/app.ts
│  ├─ src/server.ts
│  └─ src/modules/
│     ├─ mobile/
│     ├─ shifts/
│     ├─ post-duties/
│     ├─ duty-posts/
│     ├─ notifications/
│     ├─ mobile-history/
│     └─ reports/
│
├─ mobile/
│  ├─ app/build.gradle.kts
│  ├─ app/google-services.json
│  ├─ app/src/main/AndroidManifest.xml
│  └─ app/src/main/java/com/oh/routemaster/
│     ├─ data/local/
│     │  ├─ TokenStore.kt
│     │  ├─ ShiftDraftStore.kt
│     │  └─ PendingSubmissionStore.kt
│     ├─ data/remote/
│     │  ├─ ApiClient.kt
│     │  ├─ ApiModels.kt
│     │  └─ RouteMasterApi.kt
│     ├─ services/
│     │  ├─ PendingSubmissionSync.kt
│     │  ├─ PendingSubmissionWorker.kt
│     │  ├─ PendingSubmissionWorkScheduler.kt
│     │  └─ registerFcmToken.kt
│     └─ ui/
│        ├─ RouteMasterApp.kt
│        └─ screens/
│           ├─ NewShiftScreen.kt
│           ├─ HistoryScreen.kt
│           ├─ NotificationsScreen.kt
│           ├─ HomeScreen.kt
│           └─ LoginScreen.kt
└─ .gitignore
```

---

## 3. Что уже работает

### Backend

- Авторизация админки.
- Mobile login.
- Mobile bootstrap справочников.
- Справочники городов, сотрудников, нарядов, автомобилей, целей поездок, причин сработок, улиц, постов.
- Создание наряда ГБР с мобильного.
- Создание постового дежурства с мобильного.
- Уведомления админка → мобильное приложение.
- Прочитано / ответ на уведомление.
- Firebase push.
- История по городу для мобильного приложения.
- Расчет сработок по поездкам.

### Android

- Темная тема.
- Safe padding под системную шапку Android.
- Нижнее меню: `Головна / Зміна / Історія / Повідомлення`.
- Создание наряда ГБР.
- Создание постового дежурства.
- Понятная валидация с подсветкой ошибок.
- Сработки в поездках.
- Черновики формы.
- Offline queue.
- Фоновая отправка очереди через WorkManager.
- Иконка приложения Route Master.
- Release APK с подписью.

---

## 4. Backend: установка и запуск

### Требования

- Node.js.
- MySQL.
- npm.
- Firebase Admin service account JSON для push.

### Установка

```powershell
cd C:\Users\administrator\Desktop\myProj\OH\logbook-git\backend
npm install
```

### `.env`

Создать файл:

```text
backend/.env
```

Пример:

```env
DATABASE_URL="mysql://root:YOUR_PASSWORD@localhost:3306/guard_journal"

PORT=5000

JWT_SECRET="change_me_admin_user_secret"
JWT_EXPIRES_IN="7d"

ADMIN_JWT_SECRET="change_me_admin_secret"
ADMIN_JWT_EXPIRES_IN="7d"

MOBILE_JWT_SECRET="change_me_mobile_secret"
MOBILE_JWT_EXPIRES_IN="30d"

PUSH_ENABLED="true"
FIREBASE_PROJECT_ID="routmaster-4302b"
GOOGLE_APPLICATION_CREDENTIALS="C:/Users/administrator/Desktop/myProj/OH/logbook-git/mobile/routmaster-4302b-firebase-adminsdk-fbsvc-015720cf7f.json"
```

Важно:

- `GOOGLE_APPLICATION_CREDENTIALS` должен указывать на реальный Firebase Admin SDK JSON.
- Firebase Admin SDK JSON нельзя коммитить в git.
- Если путь содержит ошибку, push будет падать с `app/invalid-credential`.

### Prisma

```powershell
npx prisma generate
```

Если нужно применить миграции:

```powershell
npx prisma migrate dev
```

Если база уже готова, не выполнять миграции без понимания текущего состояния.

### Запуск backend

```powershell
npm run dev
```

Проверка:

```text
http://localhost:5000/api/health
```

Ожидаемо:

```json
{
  "status": "ok",
  "message": "Backend is working"
}
```

---

## 5. Android: запуск и тестирование

### Требования

- Android Studio.
- Android SDK.
- JDK 17.
- `google-services.json` в `mobile/app/google-services.json`.

### JAVA_HOME

Если Gradle ругается на `JAVA_HOME`, проверить:

```powershell
where.exe java
```

На время текущей PowerShell-сессии:

```powershell
$env:JAVA_HOME="C:\Program Files\Eclipse Adoptium\jdk-17.0.15.6-hotspot"
$env:Path="$env:JAVA_HOME\bin;$env:Path"
```

### Backend для телефона через USB

Если телефон подключен по USB и backend работает на компьютере:

```powershell
C:\Users\administrator\AppData\Local\Android\Sdk\platform-tools\adb.exe reverse tcp:5000 tcp:5000
```

После этого приложение может обращаться к backend через локальный адрес, если `ApiClient` настроен на `http://127.0.0.1:5000/`.

### Debug build

```powershell
cd C:\Users\administrator\Desktop\myProj\OH\logbook-git\mobile
.\gradlew.bat clean
.\gradlew.bat assembleDebug
```

APK:

```text
mobile/app/build/outputs/apk/debug/app-debug.apk
```

Установка:

```powershell
C:\Users\administrator\AppData\Local\Android\Sdk\platform-tools\adb.exe install -r ".\app\build\outputs\apk\debug\app-debug.apk"
```

---

## 6. Release APK

### Release key

В папке `mobile` создан:

```text
route-master-release.jks
```

Этот файл нельзя терять и нельзя коммитить.

### `keystore.properties`

Файл:

```text
mobile/keystore.properties
```

Пример:

```properties
storeFile=route-master-release.jks
storePassword=YOUR_STORE_PASSWORD
keyAlias=route-master
keyPassword=YOUR_KEY_PASSWORD
```

Пароли нельзя коммитить и нельзя отправлять в чат.

### Release build

```powershell
cd C:\Users\administrator\Desktop\myProj\OH\logbook-git\mobile
.\gradlew.bat clean
.\gradlew.bat assembleRelease
```

APK:

```text
mobile/app/build/outputs/apk/release/app-release.apk
```

### Установка release APK

Если на телефоне стоит debug-версия, сначала удалить:

```powershell
C:\Users\administrator\AppData\Local\Android\Sdk\platform-tools\adb.exe uninstall com.oh.routemaster
```

Потом установить release:

```powershell
C:\Users\administrator\AppData\Local\Android\Sdk\platform-tools\adb.exe install ".\app\build\outputs\apk\release\app-release.apk"
```

---

## 7. Финальный чеклист тестирования

```text
1. Приложение называется Route Master.
2. Иконка отображается нормально и не обрезается.
3. Логин работает.
4. Push-токен регистрируется.
5. Push из админки приходит на телефон.
6. Уведомление можно прочитать.
7. На уведомление можно ответить.
8. Ответ отображается в админке.
9. Наряд ГБР создается.
10. Постовое дежурство создается.
11. Сработки в поездках сохраняются.
12. История показывает записи по городу.
13. Черновик восстанавливается после закрытия приложения.
14. Если backend выключен, запись уходит в очередь.
15. После появления связи очередь отправляется через WorkManager.
16. Release APK устанавливается и работает.
```

---

## 8. Важные systemCode целей поездки

Критичные `systemCode`:

```text
Сработка ОХ        -> alarm_oh
Сработка Партнеры  -> alarm_partner
Список сработок    -> additional_alarm_list
```

Android-логика должна определять дополнительные поля именно по `systemCode`, а не по названию.

---

## 9. Важные правила Android-разработки

1. В папке:

```text
mobile/app/src/main/java/com/oh/routemaster/ui/screens
```

не должно быть дублей:

```text
NewShiftScreen(1).kt
NewShiftScreen(2).kt
```

Должен быть только:

```text
NewShiftScreen.kt
```

2. Если Gradle пишет `Redeclaration`, `Conflicting overloads`, `Overload resolution ambiguity` — почти всегда рядом лежит файл-дубликат.

3. Не ломать:
   - черновики;
   - offline queue;
   - WorkManager;
   - push registration;
   - history tab;
   - validation in `NewShiftScreen.kt`.

4. UI держать:
   - темная тема;
   - современный card-based дизайн;
   - safe padding под системную шапку;
   - нижнее меню.

---

## 10. Инструкция для нового ChatGPT

Скопировать в новый чат:

```text
Ты продолжаешь проект Route Master / OH.

Проект:
- Backend: Node.js + TypeScript + Express + Prisma + MySQL.
- Mobile: Android Kotlin + Jetpack Compose.
- Push: Firebase Cloud Messaging.
- Android app id: com.oh.routemaster.
- Backend port: 5000.
- Mobile работает через ApiClient и endpoint /api/mobile/*.

Что уже готово:
- login mobile;
- mobile bootstrap;
- push уведомления;
- чтение и ответ на уведомления;
- создание наряда ГБР;
- создание постового дежурства;
- цели поездок и сработки;
- понятная валидация;
- история по городу;
- черновики формы;
- offline queue;
- фоновая отправка очереди через WorkManager;
- release APK и иконка Route Master.

Критичные systemCode целей поездки:
- alarm_oh;
- alarm_partner;
- additional_alarm_list.

Важные файлы, которые нужно запрашивать перед правками:

Backend:
- backend/prisma/schema.prisma
- backend/src/app.ts
- backend/src/modules/mobile/mobile.routes.ts
- backend/src/modules/shifts/shifts.mobile.controller.ts
- backend/src/modules/shifts/shifts.mobile.routes.ts
- backend/src/modules/post-duties/post-duties.mobile.controller.ts
- backend/src/modules/post-duties/post-duties.mobile.routes.ts
- backend/src/modules/mobile-history/mobile-history.controller.ts
- backend/src/modules/mobile-history/mobile-history.routes.ts
- backend/src/modules/notifications/notifications.mobile.routes.ts
- backend/src/modules/notifications/notifications.mobile.controller.ts

Android:
- mobile/app/src/main/java/com/oh/routemaster/data/remote/ApiClient.kt
- mobile/app/src/main/java/com/oh/routemaster/data/remote/ApiModels.kt
- mobile/app/src/main/java/com/oh/routemaster/data/remote/RouteMasterApi.kt
- mobile/app/src/main/java/com/oh/routemaster/data/local/TokenStore.kt
- mobile/app/src/main/java/com/oh/routemaster/data/local/ShiftDraftStore.kt
- mobile/app/src/main/java/com/oh/routemaster/data/local/PendingSubmissionStore.kt
- mobile/app/src/main/java/com/oh/routemaster/services/PendingSubmissionSync.kt
- mobile/app/src/main/java/com/oh/routemaster/services/PendingSubmissionWorker.kt
- mobile/app/src/main/java/com/oh/routemaster/services/PendingSubmissionWorkScheduler.kt
- mobile/app/src/main/java/com/oh/routemaster/ui/RouteMasterApp.kt
- mobile/app/src/main/java/com/oh/routemaster/ui/screens/NewShiftScreen.kt
- mobile/app/src/main/java/com/oh/routemaster/ui/screens/HistoryScreen.kt
- mobile/app/src/main/java/com/oh/routemaster/ui/screens/NotificationsScreen.kt
- mobile/app/build.gradle.kts
- mobile/app/src/main/AndroidManifest.xml

Правила:
1. Не угадывай структуру файлов. Если нужны правки — сначала попроси актуальные файлы.
2. Не присылай куски, если лучше дать готовый файл целиком.
3. После каждой правки давай команды сборки.
4. Учитывай, что пользователь часто заменяет файлы вручную — напоминай удалить дубли вроде NewShiftScreen(1).kt.
5. Не ломай рабочие функции: push, history, drafts, pending queue, WorkManager.
6. UI держать современным: темная тема, карточки, safe padding, нижнее меню.
7. Валидация должна показывать конкретное место ошибки, а не общую фразу.
8. Пароли, .env, Firebase Admin SDK JSON, keystore и keystore.properties нельзя коммитить.
9. Если ошибка Gradle Duplicate resources — проверить дубли иконок PNG/WebP/XML.
10. Если телефон не видит backend — проверить adb reverse tcp:5000 tcp:5000.
```

---

## 11. Что можно делать дальше

- production backend URL вместо локального `127.0.0.1`;
- экран статуса offline queue;
- экспорт истории/смен;
- фильтр истории по дате;
- улучшение постовой валидации так же подробно, как ГБР;
- versionCode/versionName перед каждой release-сборкой;
- AAB для Google Play, если понадобится публикация.
