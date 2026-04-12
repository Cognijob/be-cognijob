import bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

export const hashPassword = (value: string) => bcrypt.hash(value, SALT_ROUNDS);
export const comparePassword = (value: string, hash: string) => bcrypt.compare(value, hash);
