const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function validateRegistration({email, password, confirmPassword}) {
    const errors = {};
    const trimmedEmail = String(email || "").trim();

    if (!trimmedEmail) {
        errors.email = "Email is required";
    } else if (!EMAIL_PATTERN.test(trimmedEmail)) {
        errors.email = "Enter a valid email address";
    }

    if (!password) {
        errors.password = "Password is required";
    } else if (password.length < MIN_PASSWORD_LENGTH) {
        errors.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
    }

    if (!confirmPassword) {
        errors.confirmPassword = "Please confirm your password";
    } else if (password && confirmPassword !== password) {
        errors.confirmPassword = "Passwords do not match";
    }

    return {
        isValid: Object.keys(errors).length === 0,
        errors,
    };
}

module.exports = {validateRegistration, MIN_PASSWORD_LENGTH};
