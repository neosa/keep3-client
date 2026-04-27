import {Keep3Client} from "./client.js";
import type {Keep3ClientOptions} from "./types.js";

export type Keep3SiteOptions = Record<string, Keep3ClientOptions>;

export type Keep3Site<T extends Keep3SiteOptions> = {
	[K in keyof T]: Keep3Client;
};

/**
 * Создаёт набор клиентов для сайта с произвольным числом бакетов.
 * Имена и типы бакетов выбираешь сам — `avatars`, `documents`, `public`, `private`, `cdn` и т.д.
 *
 * @example
 * const site = createKeep3Site({
 *   avatars:  {bucketId: "...", accessKey: "...", secretKey: "..."},
 *   documents: {bucketId: "...", accessKey: "...", secretKey: "..."},
 * });
 *
 * await site.avatars.upload(file);
 * await site.documents.upload(file);
 * const {url} = await site.documents.sign(id);
 */
export function createKeep3Site<T extends Keep3SiteOptions>(options: T): Keep3Site<T> {
	const result = {} as Keep3Site<T>;
	for (const key of Object.keys(options) as (keyof T)[]) {
		const cfg = options[key];
		if (!cfg) continue;
		result[key] = new Keep3Client(cfg) as Keep3Site<T>[typeof key];
	}
	return result;
}
