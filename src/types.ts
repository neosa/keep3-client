export interface Keep3ClientOptions {
	bucketId: string;
	accessKey: string;
	secretKey: string;
	fetch?: typeof fetch;
	/**
	 * Сколько раз повторять запрос при 429 (всегда — сервер его не выполнял),
	 * а также при сетевой ошибке / таймауте / 502-504 для безопасных к повтору запросов.
	 * По умолчанию 3.
	 */
	retries?: number;
	/** Таймаут одного запроса, мс. По умолчанию 60 000. 0 — без таймаута. */
	timeoutMs?: number;
	/** Таймаут загрузки (upload, uploadRaw, чанк uploadLarge), мс. По умолчанию 600 000. 0 — без таймаута. */
	uploadTimeoutMs?: number;
}

export interface FileRow {
	id: number;
	bucketId: string;
	originalName: string;
	displayName: string | null;
	size: number;
	mimeType: string;
	width: number | null;
	height: number | null;
	sha256: string;
	url: string;
	metadata: unknown;
	createdAt: string;
	deletedAt: string | null;
}

export interface FileVersionRow {
	id: number;
	fileId: number;
	originalName: string;
	size: number;
	mimeType: string;
	sha256: string;
	metadata: unknown;
	createdAt: string;
}

export interface ListFilesQuery {
	limit?: number;
	cursor?: string | number;
	search?: string;
	/** Папка, например "voice-lead". По умолчанию — весь бакет. */
	path?: string;
	/**
	 * true (по умолчанию) — файлы из всех вложенных подпапок `path`.
	 * false — только файлы строго на уровне `path` (без подпапок).
	 */
	recursive?: boolean;
	mime?: string;
	includeDeleted?: boolean;
	order?: "newest" | "oldest" | "size";
}

export interface UploadOptions {
	path?: string;
	filename?: string;
	convert?: boolean;
	/** Макс. ширина в px (только при convert: true). Изображение уменьшается до этого размера, маленькие не растягиваются. */
	maxWidth?: number;
	/** Макс. высота в px (только при convert: true). */
	maxHeight?: number;
	/** Качество WebP, 1-100. По умолчанию из настроек сервера. */
	quality?: number;
}

export interface UploadRawOptions {
	convert?: boolean;
	mimeType?: string;
	/**
	 * true — сохранить ровно по `filename` (без сгенерированного имени).
	 * Повторная загрузка перезаписывает файл (прошлая версия уходит в историю),
	 * публично отдаётся с `Cache-Control: no-cache`. Подходит для `latest.json` и т.п.
	 */
	exact?: boolean;
	maxWidth?: number;
	maxHeight?: number;
	quality?: number;
}

export interface FolderRow {
	/** Полный путь папки от корня бакета, например "voice-lead/releases". */
	path: string;
	/** Кол-во файлов внутри, включая вложенные подпапки. */
	fileCount: number;
}

export interface ListFoldersQuery {
	/** Папка, внутри которой искать подпапки. По умолчанию — корень бакета. */
	path?: string;
	/** true (по умолчанию) — всё дерево под path; false — только непосредственные подпапки. */
	recursive?: boolean;
	includeDeleted?: boolean;
}

export interface MoveOptions {
	/** Заменить файл, уже лежащий по новому пути. По умолчанию false → Keep3Error 409. */
	overwrite?: boolean;
}

export interface UploadLargeOptions {
	mimeType?: string;
	/** Размер чанка в байтах. По умолчанию 8 МБ. */
	chunkSize?: number;
	/** false — ошибка 409, если путь уже занят. По умолчанию true (перезапись). */
	overwrite?: boolean;
	/** JSON, сохраняется на файле. */
	metadata?: unknown;
	/** Прогресс: отправлено байт из total. */
	onProgress?: (sent: number, total: number) => void;
}

export interface SignOptions {
	ttl?: number;
}

export interface SignedUrl {
	url: string;
	expires: number;
}

export interface DeleteOptions {
	hard?: boolean;
}

export interface BulkResult {
	affected: number;
}

export interface ApiError {
	error: string;
}

export class Keep3Error extends Error {
	public readonly status: number;
	public readonly body: unknown;

	constructor(status: number, message: string, body?: unknown) {
		super(message);
		this.name = "Keep3Error";
		this.status = status;
		this.body = body;
	}
}
