CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('job_seeker', 'recruiter');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'job_status') THEN
        CREATE TYPE job_status AS ENUM ('active', 'closed');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'recruiter_application_status') THEN
        CREATE TYPE recruiter_application_status AS ENUM (
            'submitted',
            'reviewed',
            'next_stage',
            'accepted',
            'rejected'
        );
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'notification_type') THEN
        CREATE TYPE notification_type AS ENUM (
            'application_status',
            'new_message',
            'job_recommendation',
            'deadline_reminder'
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(150) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role user_role NOT NULL,
    gender VARCHAR(50),
    age INT CHECK (age IS NULL OR age >= 0),
    photo_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS companies (
    company_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    company_name VARCHAR(200) NOT NULL UNIQUE,
    industry VARCHAR(150),
    location VARCHAR(150),
    workplace_tag VARCHAR(150),
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS company_recruiters (
    company_recruiter_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_company_recruiter UNIQUE (company_id, user_id),
    CONSTRAINT uq_recruiter_single_company UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS job_seeker_profiles (
    profile_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(user_id) ON DELETE CASCADE,
    skills TEXT,
    portfolio_link TEXT,
    work_experience TEXT,
    awards TEXT,
    organization_experience TEXT,
    interests TEXT,
    cv_url TEXT,
    profile_completeness INT NOT NULL DEFAULT 0 CHECK (profile_completeness BETWEEN 0 AND 100),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_listings (
    job_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
    created_by UUID NOT NULL REFERENCES users(user_id) ON DELETE RESTRICT,
    title VARCHAR(200) NOT NULL,
    description TEXT NOT NULL,
    requirements TEXT NOT NULL,
    employment_type VARCHAR(100) NOT NULL,
    location VARCHAR(150) NOT NULL,
    salary_range VARCHAR(100),
    status job_status NOT NULL DEFAULT 'active',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS job_applications (
    application_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES job_listings(job_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    is_anonymous BOOLEAN NOT NULL DEFAULT TRUE,
    cv_url TEXT NOT NULL,
    recruiter_status recruiter_application_status NOT NULL DEFAULT 'submitted',
    applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_job_application UNIQUE (job_id, user_id)
);

CREATE TABLE IF NOT EXISTS bookmarks (
    bookmark_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES job_listings(job_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    bookmarked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_job_bookmark UNIQUE (job_id, user_id)
);

CREATE TABLE IF NOT EXISTS workplace_ratings (
    rating_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(company_id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    rating_score INT NOT NULL CHECK (rating_score BETWEEN 1 AND 5),
    review TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
    notification_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    type notification_type NOT NULL,
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    reference_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    reset_token_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_company_recruiters_company_id ON company_recruiters(company_id);
CREATE INDEX IF NOT EXISTS idx_job_listings_company_id ON job_listings(company_id);
CREATE INDEX IF NOT EXISTS idx_job_listings_status ON job_listings(status);
CREATE INDEX IF NOT EXISTS idx_job_applications_job_id ON job_applications(job_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_user_id ON job_applications(user_id);
CREATE INDEX IF NOT EXISTS idx_job_applications_recruiter_status ON job_applications(recruiter_status);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_workplace_ratings_company_id ON workplace_ratings(company_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_set_updated_at ON users;
CREATE TRIGGER trg_users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_companies_set_updated_at ON companies;
CREATE TRIGGER trg_companies_set_updated_at
BEFORE UPDATE ON companies
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_job_seeker_profiles_set_updated_at ON job_seeker_profiles;
CREATE TRIGGER trg_job_seeker_profiles_set_updated_at
BEFORE UPDATE ON job_seeker_profiles
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_job_listings_set_updated_at ON job_listings;
CREATE TRIGGER trg_job_listings_set_updated_at
BEFORE UPDATE ON job_listings
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_job_applications_set_updated_at ON job_applications;
CREATE TRIGGER trg_job_applications_set_updated_at
BEFORE UPDATE ON job_applications
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

CREATE OR REPLACE FUNCTION enforce_recruiter_role_for_company_membership()
RETURNS TRIGGER AS $$
DECLARE
    current_role user_role;
BEGIN
    SELECT role INTO current_role
    FROM users
    WHERE user_id = NEW.user_id;

    IF current_role IS DISTINCT FROM 'recruiter'::user_role THEN
        RAISE EXCEPTION 'Only recruiter users can be assigned to a company';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_company_recruiters_role_check ON company_recruiters;
CREATE TRIGGER trg_company_recruiters_role_check
BEFORE INSERT OR UPDATE ON company_recruiters
FOR EACH ROW
EXECUTE FUNCTION enforce_recruiter_role_for_company_membership();

CREATE OR REPLACE FUNCTION enforce_company_recruiter_limit()
RETURNS TRIGGER AS $$
DECLARE
    recruiter_total INT;
BEGIN
    SELECT COUNT(*)
    INTO recruiter_total
    FROM company_recruiters
    WHERE company_id = NEW.company_id
      AND (TG_OP = 'INSERT' OR user_id <> NEW.user_id);

    IF recruiter_total >= 3 THEN
        RAISE EXCEPTION 'A company can have at most 3 recruiters';
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_company_recruiters_limit_check ON company_recruiters;
CREATE TRIGGER trg_company_recruiters_limit_check
BEFORE INSERT OR UPDATE ON company_recruiters
FOR EACH ROW
EXECUTE FUNCTION enforce_company_recruiter_limit();

CREATE OR REPLACE VIEW applicant_application_status_view AS
SELECT
    application_id,
    job_id,
    user_id,
    recruiter_status,
    CASE recruiter_status
        WHEN 'submitted' THEN 'applied'
        WHEN 'reviewed' THEN 'screening'
        WHEN 'next_stage' THEN 'interview'
        WHEN 'accepted' THEN 'offer'
        WHEN 'rejected' THEN 'rejected'
    END AS applicant_status,
    applied_at,
    updated_at
FROM job_applications;
