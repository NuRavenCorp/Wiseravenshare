export const validators = {
    email: (email) => {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    },

    password: (password) => {
        const minLength = 8;
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumbers = /\d/.test(password);
        const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

        return {
            isValid: password.length >= minLength && hasUpperCase && hasLowerCase && hasNumbers && hasSpecialChar,
            errors: {
                length: password.length < minLength,
                upperCase: !hasUpperCase,
                lowerCase: !hasLowerCase,
                numbers: !hasNumbers,
                specialChar: !hasSpecialChar
            }
        };
    },

    username: (username) => {
        const re = /^[a-zA-Z0-9_]{3,20}$/;
        return re.test(username);
    },

    phone: (phone) => {
        const re = /^[\+]?[(]?[0-9]{1,3}[)]?[-\s\.]?[(]?[0-9]{1,3}[)]?[-\s\.]?[0-9]{3,4}[-\s\.]?[0-9]{4}$/;
        return re.test(phone);
    },

    url: (url) => {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    },

    notEmpty: (value) => {
        return value && value.trim().length > 0;
    },

    maxLength: (value, max) => {
        return value.length <= max;
    },

    minLength: (value, min) => {
        return value.length >= min;
    },

    isNumber: (value) => {
        return !isNaN(parseFloat(value)) && isFinite(value);
    },

    isInRange: (value, min, max) => {
        const num = parseFloat(value);
        return num >= min && num <= max;
    }
};

export const validatePost = (content) => {
    const errors = [];

    if (!validators.notEmpty(content)) {
        errors.push('Post content cannot be empty');
    }

    if (content && content.length > 280) {
        errors.push('Post content cannot exceed 280 characters');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
};

export const validateProfile = (profile) => {
    const errors = {};

    if (!validators.notEmpty(profile.name)) {
        errors.name = 'Name is required';
    }

    if (profile.bio && profile.bio.length > 160) {
        errors.bio = 'Bio cannot exceed 160 characters';
    }

    if (profile.location && profile.location.length > 30) {
        errors.location = 'Location cannot exceed 30 characters';
    }

    if (profile.website && !validators.url(profile.website)) {
        errors.website = 'Please enter a valid URL';
    }

    return {
        isValid: Object.keys(errors).length === 0,
        errors
    };
};