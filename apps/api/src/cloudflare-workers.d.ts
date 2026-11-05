interface SqlCursor {
	toArray(): Array<Record<string, unknown>>;
}

interface DurableObjectSql {
	exec(query: string, ...bindings: ReadonlyArray<unknown>): SqlCursor;
}

interface DurableObjectState {
	readonly storage: {
		readonly sql: DurableObjectSql;
		transactionSync<A>(run: () => A): A;
	};
}

interface DurableObjectId {}

interface DurableObjectNamespace {
	idFromName(name: string): DurableObjectId;
	get(id: DurableObjectId): { fetch(input: Request): Promise<Response> };
}

interface CloudflareEnv {
	readonly DRIVE_STATE: DurableObjectNamespace;
	readonly [key: string]: string | DurableObjectNamespace | undefined;
}

declare module 'cloudflare:workers' {
	export const env: CloudflareEnv;
	export abstract class DurableObject<E = CloudflareEnv> {
		constructor(ctx: DurableObjectState, env: E);
		readonly ctx: DurableObjectState;
		readonly env: E;
	}
}
