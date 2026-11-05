import type { SourceId } from '@private-drive/domain';

import * as Context from 'effect/Context';
import * as Effect from 'effect/Effect';
import * as Layer from 'effect/Layer';

import type { FileStore } from './file-store.ts';

import { huggingfaceStore } from './huggingface-store.ts';
import { HuggingFace } from './huggingface.ts';
import { r2Store } from './r2-store.ts';
import { R2 } from './r2.ts';
import { telegramStore } from './telegram-store.ts';
import { Telegram } from './telegram.ts';

// The only place that knows which concrete clients exist. Callers ask by source id.
export class Stores extends Context.Service<
	Stores,
	{
		readonly all: ReadonlyArray<FileStore>;
		get(id: SourceId): FileStore;
	}
>()('private-drive/api/storage/Stores') {
	static readonly layer = Layer.effect(
		Stores,
		Effect.gen(function* () {
			const r2 = r2Store(yield* R2);
			const telegram = telegramStore(yield* Telegram);
			const huggingface = huggingfaceStore(yield* HuggingFace);
			const byId: Record<SourceId, FileStore> = { huggingface, r2, telegram };
			return Stores.of({
				all: [r2, telegram, huggingface],
				get: (id) => byId[id],
			});
		}),
	).pipe(Layer.provide(R2.layer), Layer.provide(Telegram.layer), Layer.provide(HuggingFace.layer));
}
