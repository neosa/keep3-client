import {
	Keep3Error,
	type Keep3ClientOptions,
	type FileRow,
	type FileVersionRow,
	type ListFilesQuery,
	type UploadOptions,
	type UploadRawOptions,
	type SignOptions,
	type SignedUrl,
	type DeleteOptions,
	type BulkResult,
	type FolderRow,
	type ListFoldersQuery,
	type MoveOptions,
	type UploadLargeOptions,
} from "./types.js";

const API_URL = "https://api.keep3.ru";
const FILES_URL = "https://files.keep3.ru";
const DEFAULT_CHUNK_SIZE = 8 * 1024 * 1024;
const MAX_LIST_LIMIT = 500;

interface RequestInit2 {
	body?: BodyInit;
	headers?: Record<string, string>;
	query?: Record<string, string | number | boolean | undefined>;
	/** Повтор безопасен (запрос идемпотентный) — можно повторять при сетевой ошибке/5xx. */
	idempotent?: boolean;
	timeoutMs?: number;
}

export class Keep3Client {
	private readonly bucketId: string;
	private readonly accessKey: string;
	private readonly secretKey: string;
	private readonly fetchFn: typeof fetch;
	private readonly retries: number;
	private readonly timeoutMs: number;
	private readonly uploadTimeoutMs: number;

	constructor(options: Keep3ClientOptions) {
		if (!options.bucketId) throw new Error("bucketId is required");
		if (!options.accessKey) throw new Error("accessKey is required");
		if (!options.secretKey) throw new Error("secretKey is required");

		this.bucketId = options.bucketId;
		this.accessKey = options.accessKey;
		this.secretKey = options.secretKey;
		this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
		this.retries = Math.max(0, options.retries ?? 3);
		this.timeoutMs = options.timeoutMs ?? 60_000;
		this.uploadTimeoutMs = options.uploadTimeoutMs ?? 600_000;
	}

	private authHeaders(): Record<string, string> {
		return {
			"X-Access-Key": this.accessKey,
			"X-Secret-Key": this.secretKey,
		};
	}

	private async request<T>(method: string, path: string, init: RequestInit2 = {}): Promise<T> {
		const url = new URL(`${API_URL}${path}`);
		if (init.query) {
			for (const [k, v] of Object.entries(init.query)) {
				if (v === undefined) continue;
				url.searchParams.set(k, String(v));
			}
		}
		const idempotent = init.idempotent ?? (method === "GET" || method === "HEAD" || method === "DELETE");
		const timeoutMs = init.timeoutMs ?? this.timeoutMs;

		for (let attempt = 0; ; attempt++) {
			const canRetry = attempt < this.retries;
			const ctrl = timeoutMs > 0 ? new AbortController() : null;
			const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
			let res: Response;
			let text: string;
			try {
				res = await this.fetchFn(url.toString(), {
					method,
					headers: {...this.authHeaders(), ...init.headers},
					body: init.body,
					signal: ctrl?.signal,
				});
				text = await res.text();
			} catch (err) {
				const timedOut = ctrl?.signal.aborted === true;
				if (canRetry && idempotent) {
					await sleep(backoffMs(attempt));
					continue;
				}
				if (timedOut) throw new Keep3Error(0, `Request timed out after ${timeoutMs} ms`, null);
				throw err;
			} finally {
				if (timer) clearTimeout(timer);
			}

			const data = text ? safeJsonParse(text) : null;
			if (res.ok) return data as T;

			// 429 сервер не выполнял — повтор безопасен всегда. 502-504 — только для идемпотентных.
			if (canRetry && (res.status === 429 || (idempotent && res.status >= 502 && res.status <= 504))) {
				const retryAfter = Number(res.headers.get("retry-after"));
				await sleep(Number.isFinite(retryAfter) && retryAfter > 0
					? Math.min(retryAfter, 60) * 1000
					: backoffMs(attempt));
				continue;
			}

			const message =
				data && typeof data === "object" && "error" in data && typeof data.error === "string"
					? data.error
					: `HTTP ${res.status}`;
			throw new Keep3Error(res.status, message, data);
		}
	}

	async list(query: ListFilesQuery = {}): Promise<FileRow[]> {
		return this.request<FileRow[]>("GET", `/buckets/${this.bucketId}/files/`, {
			query: {
				limit: query.limit,
				cursor: query.cursor,
				search: query.search,
				pathPrefix: query.path,
				recursive: query.recursive === false ? "false" : "true",
				mime: query.mime,
				includeDeleted: query.includeDeleted ? "true" : undefined,
				order: query.order,
			},
		});
	}

	/**
	 * Все файлы по запросу, постранично (по 500) — без ручной работы с cursor.
	 * `for await (const file of client.listAll({path: "voice-lead"})) { ... }`
	 */
	async *listAll(query: Omit<ListFilesQuery, "cursor" | "limit"> = {}): AsyncGenerator<FileRow> {
		if (query.order === "size") throw new Error("listAll does not support order: \"size\" (cursor is id-based)");
		let cursor: number | undefined;
		while (true) {
			const page = await this.list({...query, limit: MAX_LIST_LIMIT, cursor});
			for (const f of page) yield f;
			if (page.length < MAX_LIST_LIMIT) return;
			cursor = page[page.length - 1]!.id;
		}
	}

	/** Папки бакета со счётчиками файлов. `{path, recursive: false}` — только непосредственные подпапки. */
	async folders(query: ListFoldersQuery = {}): Promise<FolderRow[]> {
		return this.request<FolderRow[]>("GET", `/buckets/${this.bucketId}/files/folders`, {
			query: {
				pathPrefix: query.path,
				recursive: query.recursive === false ? "false" : undefined,
				includeDeleted: query.includeDeleted ? "true" : undefined,
			},
		});
	}

	async get(fileId: number): Promise<FileRow> {
		return this.request<FileRow>("GET", `/buckets/${this.bucketId}/files/${fileId}`);
	}

	async getByPath(path: string): Promise<FileRow> {
		const encoded = path.split("/").map(encodeURIComponent).join("/");
		return this.request<FileRow>("GET", `/buckets/${this.bucketId}/files/p/${encoded}`);
	}

	async upload(
		file: Blob | File | ArrayBuffer | Uint8Array,
		options: UploadOptions = {},
	): Promise<FileRow> {
		const fd = new FormData();
		const filename = options.filename ?? (file instanceof File ? file.name : "upload.bin");
		const blob = file instanceof Blob ? file : new Blob([file as BlobPart]);
		fd.append("file", blob, filename);
		if (options.path) fd.append("path", options.path);
		fd.append("convert", options.convert === true ? "true" : "false");
		if (options.maxWidth !== undefined) fd.append("maxWidth", String(options.maxWidth));
		if (options.maxHeight !== undefined) fd.append("maxHeight", String(options.maxHeight));
		if (options.quality !== undefined) fd.append("quality", String(options.quality));

		return this.request<FileRow>("POST", `/buckets/${this.bucketId}/files/`, {
			body: fd,
			timeoutMs: this.uploadTimeoutMs,
		});
	}

	async uploadRaw(
		filename: string,
		data: ArrayBuffer | Uint8Array | Blob,
		options: UploadRawOptions = {},
	): Promise<FileRow> {
		return this.request<FileRow>("PUT", `/buckets/${this.bucketId}/files/`, {
			body: data instanceof Blob ? data : new Blob([data as BlobPart]),
			headers: options.mimeType ? {"Content-Type": options.mimeType} : {},
			// Перезапись по точному пути даёт тот же результат при повторе.
			idempotent: options.exact === true,
			timeoutMs: this.uploadTimeoutMs,
			query: {
				filename,
				convert: options.convert === true ? "true" : "false",
				exact: options.exact === true ? "true" : undefined,
				maxWidth: options.maxWidth,
				maxHeight: options.maxHeight,
				quality: options.quality,
			},
		});
	}

	/**
	 * Загрузка по частям (chunked) для больших файлов: память не растёт, обрыв сети
	 * не начинает загрузку заново — продолжаем с того байта, что сервер уже принял.
	 * Файл сохраняется ровно по `path` (как `exact: true`).
	 */
	async uploadLarge(
		path: string,
		data: Blob | ArrayBuffer | Uint8Array,
		options: UploadLargeOptions = {},
	): Promise<FileRow> {
		const blob = data instanceof Blob ? data : new Blob([data as BlobPart]);
		const total = blob.size;
		const chunkSize = Math.max(64 * 1024, options.chunkSize ?? DEFAULT_CHUNK_SIZE);

		const session = await this.request<UploadSession>("POST", `/buckets/${this.bucketId}/uploads/`, {
			body: JSON.stringify({filename: path, totalSize: total, mimeType: options.mimeType ?? (blob.type || undefined)}),
			headers: {"Content-Type": "application/json"},
		});

		let offset = 0;
		let resyncs = 0;
		while (offset < total) {
			const end = Math.min(offset + chunkSize, total);
			try {
				const updated = await this.request<UploadSession>("PATCH", `/uploads/${session.id}`, {
					body: blob.slice(offset, end),
					headers: {
						"Content-Type": "application/octet-stream",
						"Content-Range": `bytes ${offset}-${end - 1}/${total}`,
					},
					timeoutMs: this.uploadTimeoutMs,
				});
				offset = Number(updated.receivedSize);
			} catch (err) {
				// Ответ мог потеряться после того, как сервер принял чанк (или 409 out-of-order) —
				// спрашиваем, сколько байт у него есть, и продолжаем оттуда.
				const status = err instanceof Keep3Error ? err.status : 0;
				if (resyncs >= 5 || (status !== 0 && status !== 409 && status < 500)) throw err;
				resyncs += 1;
				const state = await this.request<UploadSession>("GET", `/uploads/${session.id}`);
				offset = Number(state.receivedSize);
			}
			options.onProgress?.(offset, total);
		}

		return this.request<FileRow>("POST", `/uploads/${session.id}/complete`, {
			body: JSON.stringify({overwrite: options.overwrite ?? true, metadata: options.metadata}),
			headers: {"Content-Type": "application/json"},
			idempotent: options.overwrite !== false,
		});
	}

	/** Переместить / переименовать файл без копирования. source — id или текущий путь. */
	async move(source: number | string, to: string, options: MoveOptions = {}): Promise<FileRow> {
		return this.request<FileRow>("POST", `/buckets/${this.bucketId}/files/move`, {
			body: JSON.stringify({
				...(typeof source === "number" ? {id: source} : {from: source}),
				to,
				overwrite: options.overwrite ?? false,
			}),
			headers: {"Content-Type": "application/json"},
		});
	}

	/** Переместить / переименовать папку целиком (все вложенные файлы) одним запросом. */
	async moveFolder(from: string, to: string): Promise<BulkResult> {
		return this.request<BulkResult>("POST", `/buckets/${this.bucketId}/files/move-folder`, {
			body: JSON.stringify({from, to}),
			headers: {"Content-Type": "application/json"},
		});
	}

	async delete(fileId: number, options: DeleteOptions = {}): Promise<void> {
		await this.request<{message: string}>(
			"DELETE",
			`/buckets/${this.bucketId}/files/${fileId}`,
			{query: {hard: options.hard ? "true" : undefined}},
		);
	}

	async restore(fileId: number): Promise<FileRow> {
		return this.request<FileRow>("POST", `/buckets/${this.bucketId}/files/${fileId}/restore`);
	}

	async sign(fileId: number, options: SignOptions = {}): Promise<SignedUrl> {
		return this.request<SignedUrl>("POST", `/buckets/${this.bucketId}/files/${fileId}/sign`, {
			body: JSON.stringify({ttl: options.ttl ?? 3600}),
			headers: {"Content-Type": "application/json"},
		});
	}

	async signByPath(path: string, options: SignOptions = {}): Promise<SignedUrl> {
		return this.request<SignedUrl>("POST", `/buckets/${this.bucketId}/files/sign`, {
			body: JSON.stringify({path, ttl: options.ttl ?? 3600}),
			headers: {"Content-Type": "application/json"},
		});
	}

	async bulkDelete(ids: number[], options: DeleteOptions = {}): Promise<BulkResult> {
		return this.request<BulkResult>("POST", `/buckets/${this.bucketId}/files/bulk-delete`, {
			body: JSON.stringify({ids, hard: options.hard ?? false}),
			headers: {"Content-Type": "application/json"},
		});
	}

	async bulkRestore(ids: number[]): Promise<BulkResult> {
		return this.request<BulkResult>("POST", `/buckets/${this.bucketId}/files/bulk-restore`, {
			body: JSON.stringify({ids}),
			headers: {"Content-Type": "application/json"},
		});
	}

	async versions(fileId: number): Promise<FileVersionRow[]> {
		return this.request<FileVersionRow[]>(
			"GET",
			`/buckets/${this.bucketId}/files/${fileId}/versions`,
		);
	}

	publicUrl(originalName: string): string {
		const encoded = originalName.split("/").map(encodeURIComponent).join("/");
		return `${FILES_URL}/${this.bucketId}/${encoded}`;
	}
}

interface UploadSession {
	id: string;
	receivedSize: number;
	totalSize: number;
	status: string;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 0.5s, 1s, 2s, 4s… до 10s, с джиттером — чтобы параллельные клиенты не били синхронно. */
function backoffMs(attempt: number): number {
	const base = Math.min(500 * 2 ** attempt, 10_000);
	return base / 2 + Math.random() * (base / 2);
}

function safeJsonParse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}
