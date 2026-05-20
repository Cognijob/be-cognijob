export const successResponse = (message, data) => ({
    success: true,
    message,
    data
});
export const errorResponse = (message, details) => ({
    success: false,
    message,
    details
});
