// All user-facing operations require a caller's token verified by Base44.
// A request origin, payload field, or service-role client is not a user identity.
export async function getAuthenticatedUser(req, base44) {
    const authorization = req.headers.get('Authorization') || '';
    if (!/^Bearer\s+\S+$/i.test(authorization.trim())) return null;
    try {
        const user = await base44.auth.me();
        return user?.id && user?.email ? user : null;
    } catch {
        // Failed/expired credentials must stop execution, not become a generic 500.
        return null;
    }
}