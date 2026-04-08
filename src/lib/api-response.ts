export const successResponse = <T>(message: string, data?: T) => ({
  success: true,
  message,
  data
});

export const errorResponse = (message: string, details?: unknown) => ({
  success: false,
  message,
  details
});
