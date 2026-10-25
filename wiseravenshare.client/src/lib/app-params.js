const isNode = typeof window === 'undefined';
const ACCESS_TOKEN_KEY = "wiseravenshare_access_token";

const isClearAccessTokenRequested = () =>
	!isNode && new URLSearchParams(window.location.search).get("clear_access_token") === 'true';

const readAuthTokenFromUrl = () => {
	if (isNode) {
		return null;
	}

	try {
		const params = new URLSearchParams(window.location.search);
		const candidates = [
			params.get("authToken"),
			params.get("auth_token"),
			params.get("access_token"),
			params.get("token"),
		];

		for (const candidate of candidates) {
			const token = (candidate || "").trim();
			if (token) {
				return token;
			}
		}
	} catch {
		return null;
	}

	return null;
};

const scrubAuthParamsFromUrl = () => {
	if (isNode || !window.history?.replaceState) {
		return;
	}

	try {
		const url = new URL(window.location.href);
		let changed = false;
		for (const key of ["authToken", "auth_token", "access_token", "token", "refreshToken", "adminPassToken"]) {
			if (url.searchParams.has(key)) {
				url.searchParams.delete(key);
				changed = true;
			}
		}

		if (changed) {
			window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
		}
	} catch {
		// no-op
	}
};

const clearStoredAccessToken = () => {
	window.localStorage.removeItem(ACCESS_TOKEN_KEY);
	window.localStorage.removeItem('token');
}

const writeStoredAccessToken = (token) => {
	if (!token || isNode || !window.localStorage) {
		return;
	}

	window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
	window.localStorage.setItem('token', token);
}

const getAccessToken = () => {
	if (isNode || !window.localStorage) {
		return null;
	}

	return window.localStorage.getItem(ACCESS_TOKEN_KEY) || window.localStorage.getItem("token");
};

const getAppParams = () => {
	if (isClearAccessTokenRequested()) {
		clearStoredAccessToken();
	}

	const authTokenFromUrl = readAuthTokenFromUrl();
	if (authTokenFromUrl) {
		writeStoredAccessToken(authTokenFromUrl);
		scrubAuthParamsFromUrl();
	}

	return {
		appId: import.meta.env.VITE_APP_ID || "wiseravenshare",
		token: getAccessToken(),
		functionsVersion: import.meta.env.VITE_FUNCTIONS_VERSION || "v1",
		appBaseUrl: import.meta.env.VITE_APP_BASE_URL || (isNode ? "" : window.location.origin),
	}
}


export const appParams = {
	...getAppParams()
}
