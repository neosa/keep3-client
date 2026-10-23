# @keep3/client

TypeScript/JavaScript-клиент для файлового хранилища.

Работает в Node.js 18+, браузерах, Deno, Bun и edge-средах (Cloudflare Workers, Vercel Edge). Без зависимостей.

## Установка

```bash
npm install @keep3/client
# или
yarn add @keep3/client
# или
pnpm add @keep3/client
```

## Быстрый старт — один бакет

```typescript
import {Keep3Client} from "@keep3/client";

const client = new Keep3Client({
  bucketId: "00000000-0000-0000-0000-000000000000",
  accessKey: "AKIA...",
  secretKey: "secret...",
});

const file = await client.upload(blob, {path: "images/avatars"});
console.log(file.url);
```

## Быстрый старт — проект с несколькими бакетами

Если у проекта несколько бакетов — используй `createKeep3Project` с произвольными именами:

```typescript
import {createKeep3Project} from "@keep3/client";

const project = createKeep3Project({
  avatars: {
    bucketId: "<bucket-uuid>",
    accessKey: "AKIA...",
    secretKey: "secret...",
  },
  documents: {
    bucketId: "<bucket-uuid>",
    accessKey: "AKIA...",
    secretKey: "secret...",
  },
  thumbnails: {
    bucketId: "<bucket-uuid>",
    accessKey: "AKIA...",
    secretKey: "secret...",
  },
});

const avatar = await project.avatars.upload(file, {path: "users"});
const doc = await project.documents.upload(file);
const {url} = await project.documents.sign(doc.id, {ttl: 3600});
```

Имена ключей — любые: `public`/`private`, `avatars`/`docs`, `cdn`/`uploads`. Каждый — это полноценный `Keep3Client`, у него доступны все методы из API ниже. Типы выводятся автоматически: `project.avatars` будет известен компилятору.

## API

### Конструктор

```typescript
new Keep3Client({
  bucketId: string;       // UUID бакета
  accessKey: string;      // ключ доступа из админки
  secretKey: string;      // секретный ключ
  fetch?: typeof fetch;   // кастомный fetch (для тестов / SSR)
  retries?: number;       // повторы, по умолчанию 3 (см. «Повторы и таймауты»)
  timeoutMs?: number;     // таймаут запроса, по умолчанию 60 000; 0 — без таймаута
  uploadTimeoutMs?: number; // таймаут загрузки, по умолчанию 600 000
})
```

### Файлы

#### `upload(file, options?)` — загрузка через multipart

```typescript
const file = await client.upload(blob, {
  path: "images/avatars",   // опционально, папка
  filename: "photo.jpg",    // опционально, если file — это File, имя берётся из него
  convert: true,            // опционально, конвертировать изображение в WebP. По умолчанию false (файл сохраняется как есть)
});
```

Принимает `Blob`, `File`, `ArrayBuffer`, `Uint8Array`.

По умолчанию файл сохраняется как есть. Передай `convert: true` чтобы конвертировать изображения в WebP при загрузке. Альтернативно — храни оригинал, а WebP/ресайз получай через query-параметры на уровне CDN: `<files-host>/<bucketId>/<key>?format=webp&w=400`.

#### `uploadRaw(filename, data, options?)` — прямая PUT-загрузка

```typescript
await client.uploadRaw("path/to/photo.jpg", buffer, {
  mimeType: "image/jpeg",
});
```

По умолчанию имя генерируется (`path/to/<timestamp>-<sha8>.jpg`): каждая загрузка — новый файл с новой ссылкой, публично кэшируется навсегда.

Чтобы сохранить файл **ровно по указанному пути** и перезаписывать его при повторной загрузке, передай `exact: true`:

```typescript
await client.uploadRaw("voice-lead/latest.json", new TextEncoder().encode(JSON.stringify(manifest)), {
  mimeType: "application/json",
  exact: true,
});
// → <files-host>/<bucketId>/voice-lead/latest.json, Cache-Control: no-cache
```

Прошлая версия сохраняется в истории (`versions(fileId)`). Имя не должно выглядеть как сгенерированное (`<8 символов base36>-<8 hex>.ext`) — иначе 400.

#### `list(query?)` — список файлов

```typescript
const files = await client.list({
  search: "avatar",
  path: "avatars",     // папка; по умолчанию — весь бакет
  recursive: true,     // по умолчанию true — включая подпапки; false — только этот уровень
  mime: "image/",      // или конкретный mime
  limit: 50,
  cursor: 1234,
  order: "newest",     // newest | oldest | size
  includeDeleted: false,
});
```

Максимум 500 за запрос, следующая страница — `cursor: <id последнего файла>`.

#### `listAll(query?)` — все файлы без ручной пагинации

```typescript
for await (const file of client.listAll({path: "voice-lead"})) {
  console.log(file.originalName);
}
```

Те же фильтры, что у `list`, кроме `cursor`/`limit`; `order: "size"` не поддерживается.

#### `folders(query?)` — папки со счётчиками файлов

```typescript
await client.folders();                                       // всё дерево бакета
await client.folders({recursive: false});                     // только папки в корне
await client.folders({path: "voice-lead", recursive: false}); // подпапки voice-lead
// → [{path: "voice-lead/releases", fileCount: 12}, ...]  (fileCount включает вложенные)
```

Вместе с `list({path, recursive: false})` даёт обычный просмотр «как в проводнике»: один запрос на папки уровня, один — на файлы уровня.

#### `get(fileId)` / `getByPath(path)` — получить метаданные

```typescript
const file = await client.get(123);
const file = await client.getByPath("images/avatars/photo.webp");
```

#### `uploadLarge(path, data, options?)` — большие файлы по частям

```typescript
const file = await client.uploadLarge("releases/app-1.2.0.dmg", blob, {
  mimeType: "application/x-apple-diskimage",
  chunkSize: 8 * 1024 * 1024,   // по умолчанию 8 МБ
  overwrite: true,              // false — 409, если путь занят
  onProgress: (sent, total) => console.log(`${Math.round(sent / total * 100)}%`),
});
```

Файл сохраняется ровно по `path`. Память сервера не растёт, а при обрыве связи загрузка продолжается с того байта, который сервер уже принял. Используй для всего, что больше нескольких десятков МБ.

#### `move(source, to, options?)` / `moveFolder(from, to)` — перемещение и переименование

```typescript
await client.move(123, "archive/report.pdf");               // по id
await client.move("inbox/a.pdf", "archive/a.pdf", {overwrite: true}); // по пути
await client.moveFolder("old/photos", "archive/photos");     // папка целиком → {affected}
```

Содержимое не копируется — меняется только путь (и URL). История версий и метаданные сохраняются. Занятый путь → `Keep3Error` 409 (`moveFolder` в этом случае не двигает ничего и отдаёт `body.conflicts`).

#### `delete(fileId, options?)` — удалить (по умолчанию soft-delete)

```typescript
await client.delete(123);                    // в корзину
await client.delete(123, {hard: true});      // навсегда
```

#### `restore(fileId)` — восстановить из корзины

```typescript
await client.restore(123);
```

#### `sign(fileId, options?)` / `signByPath(path, options?)` — подписанная ссылка

```typescript
const {url, expires} = await client.sign(123, {ttl: 3600});
// url: <files-host>/<bucketId>/<key>?expires=...&sig=...
```

#### `bulkDelete(ids, options?)` / `bulkRestore(ids)` — массовые операции

```typescript
const {affected} = await client.bulkDelete([1, 2, 3], {hard: true});
const {affected} = await client.bulkRestore([1, 2, 3]);
```

#### `versions(fileId)` — история перезаписей

```typescript
const versions = await client.versions(123);
```

#### `publicUrl(originalName)` — собрать публичный URL без запроса к серверу

```typescript
const url = client.publicUrl("images/avatars/photo.webp");
// <files-host>/<bucketId>/images/avatars/photo.webp
```

## Обработка ошибок

```typescript
import {Keep3Client, Keep3Error} from "@keep3/client";

try {
  await client.upload(blob);
} catch (err) {
  if (err instanceof Keep3Error) {
    console.error(err.status, err.message, err.body);
  }
}
```

### Повторы и таймауты

- **429** (превышен лимит запросов) — SDK ждёт `Retry-After` и повторяет любой запрос: сервер его не выполнял.
- **Сетевая ошибка, таймаут, 502/503/504** — повтор только для безопасных запросов: чтение, удаление, `uploadRaw(..., {exact: true})`, чанки `uploadLarge`. Обычная загрузка и `move` не повторяются, чтобы не создать дубликат.
- Пауза между попытками растёт: 0.5 → 1 → 2 → 4 с (до 10 с), с разбросом.
- Таймаут — `Keep3Error` со `status: 0`.

Лимиты по умолчанию на один ключ: 1200 чтений и 600 записей в минуту. Для массового переноса держи 4–8 параллельных запросов — этого достаточно, чтобы упереться в сеть, а не в лимит.

## Разработка

```bash
npm install
npm run dev          # сборка с watch
npm run typecheck    # проверка типов
npm run build        # production-сборка в dist/
```

## Релизы

Версии бампятся через `npm version`, который коммитит и тегает. Пуш тега запускает GitHub Actions → публикация в npm.

```bash
npm run release          # patch: 0.1.0 → 0.1.1 (багфиксы)
npm run release:minor    # minor: 0.1.0 → 0.2.0 (новые методы, обратно совместимо)
npm run release:major    # major: 0.1.0 → 1.0.0 (breaking changes)
```

Перед релизом нужно закоммитить все изменения — `npm version` откажется работать с грязным working tree.

## Лицензия

MIT
