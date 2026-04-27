import {
	Keep3Error,
	type Keep3ClientOptions,
	type FileRow,
	type FileVersionRow,
	type ListFilesQuery,
	type UploadOptions,
	type SignOptions,
	type SignedUrl,
	type DeleteOptions,
	type BulkResult,
} from "./types.js";

const DEFAULT_BASE_URL = "https://api.keep3.ru";
const DEFAULT_FILES_BASE = "https://files.keep3.ru";

export class Keep3Client {
	private readonly bucketId: string;
	private readonly accessKey: string;
	private readonly secretKey: string;
	private readonly baseURL: string;
	private readonly filesBaseURL: string;
	private readonly fetchFn: typeof fetch;

	constructor(options: Keep3ClientOptions) {
		if (!options.bucketId) throw new Error("bucketId is required");
		if (!options.accessKey) throw new Error("accessKey is required");
		if (!options.secretKey) throw new Error("secretKey is required");

		this.bucketId = options.bucketId;
		this.accessKey = options.accessKey;
		this.secretKey = options.secretKey;
		this.baseURL = (options.baseURL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
		this.filesBaseURL = (options.filesBaseURL ?? DEFAULT_FILES_BASE).replace(/\/+$/, "");
		this.fetchFn = options.fetch ?? globalThis.fetch.bind(globalThis);
	}

	private authHeaders(): Record<string, string> {
		return {
			"X-Access-Key": this.accessKey,
			"X-Secret-Key": this.secretKey,
		};
	}

	private async request<T>(
		method: string,
		path: string,
		init?: {body?: BodyInit; headers?: Record<string, string>; query?: Record<string, string | number | boolean | undefined>},
	): Promise<T> {
		const url = new URL(`${this.baseURL}${path}`);
		if (init?.query) {
			for (const [k, v] of Object.entries(init.query)) {
				if (v === undefined) continue;
				url.searchParams.set(k, String(v));
			}
		}

		const res = await this.fetchFn(url.toString(), {
			method,
			headers: {...this.authHeaders(), ...init?.headers},
			body: init?.body,
		});

		const text = await res.text();
		const data = text ? safeJsonParse(text) : null;

		if (!res.ok) {
			const message =
				data && typeof data === "object" && "error" in data && typeof data.error === "string"
					? data.error
					: `HTTP ${res.status}`;
			throw new Keep3Error(res.status, message, data);
		}

		return data as T;
	}

	async list(query: ListFilesQuery = {}): Promise<FileRow[]> {
		return this.request<FileRow[]>("GET", `/buckets/${this.bucketId}/files/`, {
			query: {
				limit: query.limit,
				cursor: query.cursor,
				search: query.search,
				mime: query.mime,
				includeDeleted: query.includeDeleted ? "true" : undefined,
				order: query.order,
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
		fd.append("convert", options.convert === false ? "false" : "true");

		return this.request<FileRow>("POST", `/buckets/${this.bucketId}/files/`, {body: fd});
	}

	async uploadRaw(
		filename: string,
		data: ArrayBuffer | Uint8Array | Blob,
		options: {convert?: boolean; mimeType?: string} = {},
	): Promise<FileRow> {
		return this.request<FileRow>("PUT", `/buckets/${this.bucketId}/files/`, {
			body: data instanceof Blob ? data : new Blob([data as BlobPart]),
			headers: options.mimeType ? {"Content-Type": options.mimeType} : {},
			query: {
				filename,
				convert: options.convert === false ? "false" : "true",
			},
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
		return `${this.filesBaseURL}/${this.bucketId}/${encoded}`;
	}
}

function safeJsonParse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return null;
	}
}
