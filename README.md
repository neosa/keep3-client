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

#### `list(query?)` — список файлов

```typescript
const files = await client.list({
  search: "avatar",
  mime: "image/",      // или конкретный mime
  limit: 50,
  cursor: 1234,
  order: "newest",     // newest | oldest | size
  includeDeleted: false,
});
```

#### `get(fileId)` / `getByPath(path)` — получить метаданные

```typescript
const file = await client.get(123);
const file = await client.getByPath("images/avatars/photo.webp");
```

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
