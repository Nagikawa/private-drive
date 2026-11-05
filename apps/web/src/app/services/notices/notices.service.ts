import { Service, signal } from '@angular/core';
import { timer } from 'rxjs';

@Service()
export class Notices {
	readonly message = signal('');

	// Shows a short status and clears it only if a newer notice has not replaced it.
	show(message: string): void {
		this.message.set(message);
		timer(2000).subscribe(() => {
			if (this.message() === message) {
				this.message.set('');
			}
		});
	}
}
