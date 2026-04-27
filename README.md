# @keep3/client

Official TypeScript/JavaScript client for [keep3.ru](https://keep3.ru) file storage.

Works in Node.js 18+, browsers, Deno, Bun, and edge runtimes (Cloudflare Workers, Vercel Edge). Zero dependencies.

## Установка

```bash
npm install @keep3/client
# или
yarn add @keep3/client
# или
pnpm add @keep3/client
```

## Быстрый старт

```typescript
import {Keep3Client} from "@keep3/client";

const client = new Keep3Client({
  bucketId: "00000000-0000-0000-0000-000000000000",
  accessKey: "AKIA...",
  secretKey: "secret...",
});

// Загрузка
const file = await client.upload(blob, {
  path: "images/avatars",
  filename: "photo.jpg",
});

console.log(file.url); // https://files.keep3.ru/<bucketId>/<generated-name>.webp
```

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
  convert: true,            // конвертировать изображения в WebP (по умолчанию true)
});
```

Принимает `Blob`, `File`, `ArrayBuffer`, `Uint8Array`.

#### `uploadRaw(filename, data, options?)` — прямая PUT-загрузка

```typescript
await client.uploadRaw("path/to/photo.jpg", buffer, {
  mimeType: "image/jpeg",
  convert: true,
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
// url: https://files.keep3.ru/<bucketId>/<key>?expires=...&sig=...
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
// https://files.keep3.ru/<bucketId>/images/avatars/photo.webp
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
