process.env.NODE_ENV = "test";
process.env.PORT = "3001";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/cognijob_test";
process.env.JWT_SECRET = process.env.JWT_SECRET ?? "test-secret-1234567890";
process.env.JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? "1d";
process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? "https://example.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "test-service-role-key";
process.env.SUPABASE_BUCKET = process.env.SUPABASE_BUCKET ?? "cv-files";
process.env.APP_BASE_URL = process.env.APP_BASE_URL ?? "http://localhost:3001";
