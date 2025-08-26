package migrations

// GetTokenMigrations returns all database migrations for the token management service
func GetTokenMigrations() []string {
	return []string{
		createTokensTable,
		createTokenAuditTrailTable,
		createTokenIndexes,
	}
}

// createTokensTable creates the main tokens table
const createTokensTable = `
CREATE TABLE IF NOT EXISTS tokens (
    token_id UUID PRIMARY KEY,
    cbdc_type VARCHAR(50) NOT NULL,
    denomination DECIMAL(15,2) NOT NULL CHECK (denomination > 0),
    current_owner UUID NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('active', 'frozen', 'disputed', 'invalid')),
    issue_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    transaction_history JSONB DEFAULT '[]'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    compliance_flags JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Add comments for documentation
COMMENT ON TABLE tokens IS 'Smart tokens with metadata and state management capabilities';
COMMENT ON COLUMN tokens.token_id IS 'Unique identifier for the token';
COMMENT ON COLUMN tokens.cbdc_type IS 'Type of Central Bank Digital Currency (USD-CBDC, EUR-CBDC, etc.)';
COMMENT ON COLUMN tokens.denomination IS 'Token value/denomination';
COMMENT ON COLUMN tokens.current_owner IS 'Current owner of the token';
COMMENT ON COLUMN tokens.status IS 'Current status of the token (active, frozen, disputed, invalid)';
COMMENT ON COLUMN tokens.issue_timestamp IS 'When the token was originally issued';
COMMENT ON COLUMN tokens.transaction_history IS 'Array of transaction IDs involving this token';
COMMENT ON COLUMN tokens.metadata IS 'Token metadata including issuer, series, and security features';
COMMENT ON COLUMN tokens.compliance_flags IS 'Compliance status flags (KYC, AML, sanctions)';
`

// createTokenAuditTrailTable creates the audit trail table for token operations
const createTokenAuditTrailTable = `
CREATE TABLE IF NOT EXISTS token_audit_trail (
    id UUID PRIMARY KEY,
    token_id UUID NOT NULL,
    operation VARCHAR(50) NOT NULL,
    old_status VARCHAR(20),
    new_status VARCHAR(20),
    old_owner UUID,
    new_owner UUID,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'::jsonb,
    
    CONSTRAINT fk_token_audit_token_id 
        FOREIGN KEY (token_id) 
        REFERENCES tokens(token_id) 
        ON DELETE CASCADE
);

-- Add comments for documentation
COMMENT ON TABLE token_audit_trail IS 'Immutable audit trail for all token operations';
COMMENT ON COLUMN token_audit_trail.id IS 'Unique identifier for the audit entry';
COMMENT ON COLUMN token_audit_trail.token_id IS 'Reference to the token being audited';
COMMENT ON COLUMN token_audit_trail.operation IS 'Type of operation (CREATE, STATUS_CHANGE, OWNERSHIP_TRANSFER, etc.)';
COMMENT ON COLUMN token_audit_trail.old_status IS 'Previous token status (for status changes)';
COMMENT ON COLUMN token_audit_trail.new_status IS 'New token status (for status changes)';
COMMENT ON COLUMN token_audit_trail.old_owner IS 'Previous token owner (for ownership transfers)';
COMMENT ON COLUMN token_audit_trail.new_owner IS 'New token owner (for ownership transfers)';
COMMENT ON COLUMN token_audit_trail.timestamp IS 'When the operation occurred';
COMMENT ON COLUMN token_audit_trail.metadata IS 'Additional operation metadata';
`

// createTokenIndexes creates indexes for optimal query performance
const createTokenIndexes = `
-- Index for token lookups by owner (most common query)
CREATE INDEX IF NOT EXISTS idx_tokens_current_owner ON tokens(current_owner);

-- Index for token lookups by status (for fraud detection and reversibility)
CREATE INDEX IF NOT EXISTS idx_tokens_status ON tokens(status);

-- Index for token lookups by CBDC type (for cross-currency operations)
CREATE INDEX IF NOT EXISTS idx_tokens_cbdc_type ON tokens(cbdc_type);

-- Composite index for owner + status queries (wallet filtering)
CREATE INDEX IF NOT EXISTS idx_tokens_owner_status ON tokens(current_owner, status);

-- Index for time-based queries (recent tokens, aging analysis)
CREATE INDEX IF NOT EXISTS idx_tokens_created_at ON tokens(created_at);

-- Index for issue timestamp (for compliance and audit queries)
CREATE INDEX IF NOT EXISTS idx_tokens_issue_timestamp ON tokens(issue_timestamp);

-- Audit trail indexes
CREATE INDEX IF NOT EXISTS idx_token_audit_token_id ON token_audit_trail(token_id);
CREATE INDEX IF NOT EXISTS idx_token_audit_timestamp ON token_audit_trail(timestamp);
CREATE INDEX IF NOT EXISTS idx_token_audit_operation ON token_audit_trail(operation);

-- Composite index for audit queries by token and time
CREATE INDEX IF NOT EXISTS idx_token_audit_token_timestamp ON token_audit_trail(token_id, timestamp DESC);

-- GIN index for transaction history JSON queries
CREATE INDEX IF NOT EXISTS idx_tokens_transaction_history ON tokens USING GIN(transaction_history);

-- GIN index for metadata JSON queries
CREATE INDEX IF NOT EXISTS idx_tokens_metadata ON tokens USING GIN(metadata);

-- GIN index for compliance flags JSON queries
CREATE INDEX IF NOT EXISTS idx_tokens_compliance_flags ON tokens USING GIN(compliance_flags);
`