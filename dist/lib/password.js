import bcrypt from "bcrypt";
const SALT_ROUNDS = 10;
export const hashPassword = (value) => bcrypt.hash(value, SALT_ROUNDS);
export const comparePassword = (value, hash) => bcrypt.compare(value, hash);
