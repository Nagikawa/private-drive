import { TestBed } from '@angular/core/testing';

import { DriveApi } from './drive-api.service';

describe('DriveApi', () => {
	// Image and media previews load this URL directly.
	it('builds a content URL for a file id', () => {
		TestBed.configureTestingModule({ providers: [DriveApi] });
		expect(TestBed.inject(DriveApi).contentUrl('a b')).toBe('/api/files/a%20b/content');
	});
});
