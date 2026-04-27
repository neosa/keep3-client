export interface Keep3ClientOptions {
	bucketId: string;
	accessKey: string;
	secretKey: string;
	fetch?: typeof fetch;
}

export interface FileRow {
	id: number;
	bucketId: string;
	originalName: string;
	displayName: string | null;
	size: number;
	mimeType: string;
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
	mime?: string;
	includeDeleted?: boolean;
	order?: "newest" | "oldest" | "size";
}

export interface UploadOptions {
	path?: string;
	filename?: string;
	convert?: boolean;
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
