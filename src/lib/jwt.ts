import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { UserRole } from "../db/schema.js";

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export const signAccessToken = (payload: JwtPayload) =>
  jwt.sign(payload, env.JWT_SECRET, {
    expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"]
  });

export const verifyAccessToken = (token: string) =>
  jwt.verify(token, env.JWT_SECRET) as JwtPayload;
