import { TestBed } from '@angular/core/testing';
import * as Effect from 'effect/Effect';
import * as Exit from 'effect/Exit';

import { DriveRuntime } from './drive-runtime.service';

describe('DriveRuntime', () => {
	// A plain effect runs to a success exit without rejecting the promise.
	it('runs an effect to an exit', async () => {
		TestBed.configureTestingModule({ providers: [DriveRuntime] });
		const exit = await TestBed.inject(DriveRuntime).run(Effect.succeed(7));
		expect(Exit.isSuccess(exit) && exit.value).toBe(7);
	});
});
