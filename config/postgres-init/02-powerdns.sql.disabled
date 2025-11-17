-- PowerDNS PostgreSQL Schema
-- Adapted from official PowerDNS 4.7+ schema
-- Runs during container initialization

-- Create powerdns database and user
SELECT 'Creating PowerDNS database...' AS status;
CREATE DATABASE powerdns;
CREATE USER powerdns WITH ENCRYPTED PASSWORD '${POWERDNS_DB_PASSWORD}';
ALTER DATABASE powerdns OWNER TO powerdns;
GRANT ALL PRIVILEGES ON DATABASE powerdns TO powerdns;

\c powerdns

-- Grant schema permissions
GRANT ALL ON SCHEMA public TO powerdns;
ALTER SCHEMA public OWNER TO powerdns;

-- Domains table (zones)
CREATE TABLE domains (
  id                    SERIAL PRIMARY KEY,
  name                  VARCHAR(255) NOT NULL UNIQUE,
  master                VARCHAR(128) DEFAULT NULL,
  last_check            INT DEFAULT NULL,
  type                  VARCHAR(6) NOT NULL,
  notified_serial       BIGINT DEFAULT NULL,
  account               VARCHAR(40) DEFAULT NULL
);

CREATE INDEX name_index ON domains(name);

-- Records table
CREATE TABLE records (
  id                    BIGSERIAL PRIMARY KEY,
  domain_id             INT DEFAULT NULL,
  name                  VARCHAR(255) DEFAULT NULL,
  type                  VARCHAR(10) DEFAULT NULL,
  content               VARCHAR(65535) DEFAULT NULL,
  ttl                   INT DEFAULT NULL,
  prio                  INT DEFAULT NULL,
  disabled              BOOL DEFAULT 'f',
  ordername             VARCHAR(255),
  auth                  BOOL DEFAULT 't',
  CONSTRAINT domain_exists FOREIGN KEY(domain_id) REFERENCES domains(id) ON DELETE CASCADE
);

CREATE INDEX nametype_index ON records(name,type);
CREATE INDEX domain_id_index ON records(domain_id);
CREATE INDEX orderindex ON records(ordername);

-- Supermasters table
CREATE TABLE supermasters (
  ip                    INET NOT NULL,
  nameserver            VARCHAR(255) NOT NULL,
  account               VARCHAR(40) NOT NULL,
  PRIMARY KEY(ip, nameserver)
);

-- Comments table
CREATE TABLE comments (
  id                    SERIAL PRIMARY KEY,
  domain_id             INT NOT NULL,
  name                  VARCHAR(255) NOT NULL,
  type                  VARCHAR(10) NOT NULL,
  modified_at           INT NOT NULL,
  account               VARCHAR(40) DEFAULT NULL,
  comment               VARCHAR(65535) NOT NULL,
  CONSTRAINT domain_exists FOREIGN KEY(domain_id) REFERENCES domains(id) ON DELETE CASCADE
);

CREATE INDEX comments_domain_id_idx ON comments(domain_id);
CREATE INDEX comments_nametype_idx ON comments(name, type);
CREATE INDEX comments_order_idx ON comments(domain_id, modified_at);

-- Domain metadata
CREATE TABLE domainmetadata (
  id                    SERIAL PRIMARY KEY,
  domain_id             INT NOT NULL,
  kind                  VARCHAR(32),
  content               TEXT,
  CONSTRAINT domain_exists FOREIGN KEY(domain_id) REFERENCES domains(id) ON DELETE CASCADE
);

CREATE INDEX domainmetadata_idx ON domainmetadata(domain_id, kind);

-- Cryptokeys for DNSSEC
CREATE TABLE cryptokeys (
  id                    SERIAL PRIMARY KEY,
  domain_id             INT NOT NULL,
  flags                 INT NOT NULL,
  active                BOOL,
  content               TEXT,
  CONSTRAINT domain_exists FOREIGN KEY(domain_id) REFERENCES domains(id) ON DELETE CASCADE
);

CREATE INDEX domainidindex ON cryptokeys(domain_id);

-- TSIG keys
CREATE TABLE tsigkeys (
  id                    SERIAL PRIMARY KEY,
  name                  VARCHAR(255) UNIQUE,
  algorithm             VARCHAR(50),
  secret                VARCHAR(255)
);

CREATE INDEX namealgoindex ON tsigkeys(name, algorithm);

-- Grant all permissions to powerdns user
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO powerdns;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO powerdns;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO powerdns;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO powerdns;

SELECT 'PowerDNS database schema created successfully!' AS status;
