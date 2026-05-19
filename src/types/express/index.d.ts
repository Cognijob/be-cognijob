/// <reference types="multer" />
import type { UserRole } from "../../db/schema.js";

declare global {
  namespace Express {
    interface AuthUser {
      userId: string;
      email: string;
      role: UserRole;
    }

    interface Request {
      user?: AuthUser;
    }
  }
}

export {};
