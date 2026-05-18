// src/middlewares/upload.ts
// Middleware untuk menangani file upload menggunakan multer dengan memory storage.
// Helper untuk users.routes.ts

import multer from "multer";

const storage = multer.memoryStorage();

export const upload = multer({
  storage,
});
