import { useEffect, useState } from "react";
import { resolveApiUrl } from "@/api/client";

export const DEFAULT_BRAND_LOGO_URL = "/assets/branding/website-icon.jpg";

let brandingPromise = null;

const fetchBrandLogoUrl = async () => {
  if (!brandingPromise) {
    brandingPromise = fetch(resolveApiUrl("/api/platform/branding"), {
      method: "GET",
      credentials: "include",
    })
      .then(async (response) => {
        if (!response.ok) {
          return DEFAULT_BRAND_LOGO_URL;
        }

        const payload = await response.json();
        const fromApi = payload?.brand_logo_url || payload?.brandLogoUrl;
        return typeof fromApi === "string" && fromApi.trim().length > 0
          ? fromApi.trim()
          : DEFAULT_BRAND_LOGO_URL;
      })
      .catch(() => DEFAULT_BRAND_LOGO_URL);
  }

  return brandingPromise;
};

export function useBrandLogo() {
  const [logoUrl, setLogoUrl] = useState(DEFAULT_BRAND_LOGO_URL);

  useEffect(() => {
    let isMounted = true;
    fetchBrandLogoUrl().then((resolvedUrl) => {
      if (isMounted && resolvedUrl) {
        setLogoUrl(resolvedUrl);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return logoUrl;
}
