import { useEffect, useState } from 'react';

const getViewport = () => {
    if (typeof window === 'undefined') {
        return { width: 1280, height: 720 };
    }

    const viewport = window.visualViewport;
    const width = Math.round(viewport?.width || window.innerWidth || 1280);
    const height = Math.round(viewport?.height || window.innerHeight || 720);
    return { width, height };
};

const resolveSize = (width) => {
    if (width < 360) return 'xs';
    if (width < 576) return 'sm';
    if (width < 768) return 'md';
    if (width < 1024) return 'lg';
    return 'xl';
};

const resolveOrientation = (width, height) => (width >= height ? 'landscape' : 'portrait');

const readScreenProfile = () => {
    const { width, height } = getViewport();
    return {
        width,
        height,
        size: resolveSize(width),
        orientation: resolveOrientation(width, height)
    };
};

const applyScreenProfile = (profile) => {
    if (typeof document === 'undefined') {
        return;
    }

    const root = document.documentElement;
    root.setAttribute('data-screen-size', profile.size);
    root.setAttribute('data-screen-orientation', profile.orientation);
    root.style.setProperty('--viewport-width', `${profile.width}px`);
    root.style.setProperty('--viewport-height', `${profile.height}px`);
};

export const useScreenSize = () => {
    const [profile, setProfile] = useState(() => readScreenProfile());

    useEffect(() => {
        applyScreenProfile(profile);
    }, [profile]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return undefined;
        }

        let frame = 0;
        const update = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                setProfile((current) => {
                    const next = readScreenProfile();
                    if (
                        current.width === next.width
                        && current.height === next.height
                        && current.size === next.size
                        && current.orientation === next.orientation
                    ) {
                        return current;
                    }

                    return next;
                });
            });
        };

        window.addEventListener('resize', update);
        window.addEventListener('orientationchange', update);
        window.visualViewport?.addEventListener('resize', update);
        update();

        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('resize', update);
            window.removeEventListener('orientationchange', update);
            window.visualViewport?.removeEventListener('resize', update);
        };
    }, []);

    return profile;
};

