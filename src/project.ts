import {Keep3Client} from "./client.js";
import type {Keep3ClientOptions} from "./types.js";

export type Keep3ProjectOptions = Record<string, Keep3ClientOptions>;

export type Keep3Project<T extends Keep3ProjectOptions> = {
	[K in keyof T]: Keep3Client;
};

/**
 * Создаёт набор клиентов для проекта с произвольным числом бакетов.
 * Имена и типы бакетов выбираешь сам — `avatars`, `documents`, `public`, `private`, `cdn` и т.д.
 *
 * @example
 * const project = createKeep3Project({
 *   avatars:   {bucketId: "...", accessKey: "...", secretKey: "..."},
 *   documents: {bucketId: "...", accessKey: "...", secretKey: "..."},
 * });
 *
 * await project.avatars.upload(file);
 * await project.documents.upload(file);
 * const {url} = await project.documents.sign(id);
 */
export function createKeep3Project<T extends Keep3ProjectOptions>(options: T): Keep3Project<T> {
	const result = {} as Keep3Project<T>;
	for (const key of Object.keys(options) as (keyof T)[]) {
		const cfg = options[key];
		if (!cfg) continue;
		result[key] = new Keep3Client(cfg) as Keep3Project<T>[typeof key];
	}
	return result;
}
