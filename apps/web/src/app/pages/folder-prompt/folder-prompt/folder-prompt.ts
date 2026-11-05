import { Component, ElementRef, output, signal, viewChild } from '@angular/core';
import { form, FormField, required, submit } from '@angular/forms/signals';
import * as Effect from 'effect/Effect';

import { SessionFailure } from '../../../core/drive-error';

@Component({
	selector: 'app-folder-prompt',
	imports: [FormField],
	templateUrl: './folder-prompt.html',
})
export class FolderPrompt {
	private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
	readonly named = output<string>();
	protected readonly title = signal('New folder');
	protected readonly action = signal('Create');
	private readonly model = signal({ name: '' });
	// Requires a folder name before the dialog can close with a value.
	protected readonly nameForm = form(this.model, (path) => {
		required(path.name, { message: 'Enter a name' });
	});

	// Opens the name dialog, optionally filled with the current file name.
	open(name = '', title = 'New folder', action = 'Create'): void {
		this.title.set(title);
		this.action.set(action);
		this.model.set({ name });
		const element = this.dialog().nativeElement;
		if (!element.open) {
			element.showModal();
		}
	}

	// Closes the dialog without creating a folder.
	protected cancel(): void {
		this.dialog().nativeElement.close('');
	}

	// Emits the typed name when the dialog closes with a value.
	protected onClose(): void {
		const name = this.dialog().nativeElement.returnValue;
		if (name !== '') {
			this.named.emit(name);
		}
	}

	// Validates the name, then closes the dialog with that name so the parent can create the folder.
	protected onSubmit(event: Event): void {
		event.preventDefault();
		const nameForm = this.nameForm;
		const dialog = this.dialog().nativeElement;
		const name = this.model().name.trim();
		const program = Effect.tryPromise({
			try: () =>
				submit(nameForm, async () => {
					dialog.close(name);
				}),
			catch: () => new SessionFailure({ message: 'Could not save the folder name' }),
		}).pipe(
			Effect.catch(() => Effect.void),
			Effect.asVoid,
		);
		void Effect.runPromiseExit(program);
	}
}
