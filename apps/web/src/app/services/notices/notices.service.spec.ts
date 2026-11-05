import { TestBed } from '@angular/core/testing';

import { Notices } from './notices.service';

describe('Notices', () => {
	// A newer notice replaces the old one, and only that newer timer clears the bar.
	it('keeps the latest message until its own timer fires', () => {
		vi.useFakeTimers();
		TestBed.configureTestingModule({ providers: [Notices] });
		const notices = TestBed.inject(Notices);
		notices.show('Saved');
		vi.advanceTimersByTime(1000);
		notices.show('Moved');
		vi.advanceTimersByTime(1000);
		expect(notices.message()).toBe('Moved');
		vi.advanceTimersByTime(1000);
		expect(notices.message()).toBe('');
		vi.useRealTimers();
	});
});
