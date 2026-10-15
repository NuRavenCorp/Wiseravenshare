const isNode = typeof window === 'undefined';
const ACCESS_TOKEN_KEY = "wiseravenshare_access_token";

const isClearAccessTokenRequested = () =>
	!isNode && new URLSearchParams(window.location.search).get("clear_access_token") === 'true';

const clearStoredAccessToken = () => {
	window.localStorage.removeItem(ACCESS_TOKEN_KEY);
	window.localStorage.removeItem('token');
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
