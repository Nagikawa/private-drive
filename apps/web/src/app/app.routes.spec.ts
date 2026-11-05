import { routes } from './app.routes';

describe('routes', () => {
	// Login is public. Everything else sits behind the session and opens the file browser.
	it('sends home to the files page', () => {
		const login = routes.find((route) => route.path === 'login');
		const shell = routes.find((route) => route.path === '');
		expect(login?.canActivate).toBeDefined();
		expect(shell?.canActivate).toBeDefined();
		const home = shell?.children?.find((route) => route.path === '');
		expect(home?.redirectTo).toBe('files');
	});
});
