const encoder = new TextEncoder();

async function hmac(key, data) {
    const cryptoKey = await crypto.subtle.importKey(
        "raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
    );
    return crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(data));
}

async function sha256Hex(data) {
    const hash = await crypto.subtle.digest("SHA-256", encoder.encode(data));
    return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function toHex(buf) {
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

async function getSigningKey(secretKey, date, region, service) {
    const kDate = await hmac(encoder.encode("AWS4" + secretKey), date);
    const kRegion = await hmac(kDate, region);
    const kService = await hmac(kRegion, service);
    return hmac(kService, "aws4_request");
}

function encodePath(path) {
    return path.split("/").map(encodeURIComponent).join("/");
}

async function presign(opts) {
    const { method, accessKey, secretKey, host, region, key, expiresIn = 3600, contentLength } = opts;
    const service = "s3";
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:-]/g, "").split(".")[0] + "Z";
    const date = timestamp.substring(0, 8);

    const objectPath = "/" + encodePath(key);

    // When contentLength is provided, sign the content-length header so the
    // upload is constrained to exactly that size — the PUT will fail if the
    // client sends a different Content-Length.
    const signedHeaders = contentLength !== undefined
        ? "content-length;host"
        : "host";

    const queryParams: Record<string, string> = {
        "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
        "X-Amz-Credential": `${accessKey}/${date}/${region}/${service}/aws4_request`,
        "X-Amz-Date": timestamp,
        "X-Amz-Expires": String(expiresIn),
        "X-Amz-SignedHeaders": signedHeaders,
    };

    const canonicalQuery = Object.keys(queryParams)
        .sort()
        .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
        .join("&");

    const signedHeaderBlock = contentLength !== undefined
        ? `content-length:${contentLength}\nhost:${host}\n`
        : `host:${host}\n`;

    const canonicalRequest = `${method}\n${objectPath}\n${canonicalQuery}\n${signedHeaderBlock}\n${signedHeaders}\nUNSIGNED-PAYLOAD`;

    const credentialScope = `${date}/${region}/${service}/aws4_request`;
    const stringToSign = `AWS4-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${await sha256Hex(canonicalRequest)}`;

    const signingKey = await getSigningKey(secretKey, date, region, service);
    const signature = toHex(await hmac(signingKey, stringToSign));

    return `https://${host}${objectPath}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

export async function presignUpload(opts) {
    return presign({ ...opts, method: "PUT" });
}

export async function presignGet(opts) {
    return presign({ ...opts, method: "GET" });
}