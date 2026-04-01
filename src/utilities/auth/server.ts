import "server-only";

export type Auth = {
	user: null;
	isLoggedIn: false;
};

export async function getAuth(): Promise<Auth> {
	return {
		user: null,
		isLoggedIn: false,
	};
}
