package repository

import (
	"context"
	"database/sql"
	"fmt"
	"strings"

	"github.com/google/uuid"
	
	"echopay/shared/libraries/database"
	"echopay/shared/libraries/errors"
	"echopay/token-management/src/models"
)

// TokenRepository handles token data persistence
type TokenRepository interface {
	Create(ctx context.Context, token *models.Token) error
	CreateWithTx(ctx context.Context, tx *sql.Tx, token *models.Token) error
	GetByID(ctx context.Context, tokenID uuid.UUID) (*models.Token, error)
	GetByIDWithTx(ctx context.Context, tx *sql.Tx, tokenID uuid.UUID) (*models.Token, error)
	Update(ctx context.Context, token *models.Token) error
	UpdateWithTx(ctx context.Context, tx *sql.Tx, token *models.Token) error
	GetByOwner(ctx context.Context, ownerID uuid.UUID) ([]models.Token, error)
	GetByStatus(ctx context.Context, status models.TokenStatus) ([]models.Token, error)
	GetByCBDCType(ctx context.Context, cbdcType models.CBDCType) ([]models.Token, error)
	BulkUpdateStatus(ctx context.Context, tokenIDs []uuid.UUID, status models.TokenStatus) error
	GetAuditTrail(ctx context.Context, tokenID uuid.UUID) ([]TokenAuditEntry, error)
}

// tokenRepository implements TokenRepository
type tokenRepository struct {
	db *database.PostgresDB
}

// TokenAuditEntry represents an audit trail entry for token operations
type TokenAuditEntry struct {
	ID          uuid.UUID           `json:"id" db:"id"`
	TokenID     uuid.UUID           `json:"token_id" db:"token_id"`
	Operation   string              `json:"operation" db:"operation"`
	OldStatus   models.TokenStatus  `json:"old_status" db:"old_status"`
	NewStatus   models.TokenStatus  `json:"new_status" db:"new_status"`
	OldOwner    uuid.UUID           `json:"old_owner" db:"old_owner"`
	NewOwner    uuid.UUID           `json:"new_owner" db:"new_owner"`
	Timestamp   sql.NullTime        `json:"timestamp" db:"timestamp"`
	Metadata    map[string]interface{} `json:"metadata" db:"metadata"`
}

// NewTokenRepository creates a new token repository
func NewTokenRepository(db *database.PostgresDB) TokenRepository {
	return &tokenRepository{
		db: db,
	}
}

// Create inserts a new token into the database
func (r *tokenRepository) Create(ctx context.Context, token *models.Token) error {
	return r.CreateWithTx(ctx, nil, token)
}

// CreateWithTx inserts a new token using an existing transaction
func (r *tokenRepository) CreateWithTx(ctx context.Context, tx *sql.Tx, token *models.Token) error {
	query := `
		INSERT INTO tokens (
			token_id, cbdc_type, denomination, current_owner, status,
			issue_timestamp, transaction_history, metadata, compliance_flags,
			created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11
		)`

	var err error
	if tx != nil {
		_, err = tx.ExecContext(ctx, query,
			token.TokenID,
			token.CBDCType,
			token.Denomination,
			token.CurrentOwner,
			token.Status,
			token.IssueTimestamp,
			token.TransactionHistory,
			token.Metadata,
			token.ComplianceFlags,
			token.CreatedAt,
			token.UpdatedAt,
		)
	} else {
		_, err = r.db.ExecContext(ctx, query,
			token.TokenID,
			token.CBDCType,
			token.Denomination,
			token.CurrentOwner,
			token.Status,
			token.IssueTimestamp,
			token.TransactionHistory,
			token.Metadata,
			token.ComplianceFlags,
			token.CreatedAt,
			token.UpdatedAt,
		)
	}

	if err != nil {
		return fmt.Errorf("failed to create token: %w", err)
	}

	// Create audit trail entry
	if err := r.createAuditEntry(ctx, tx, token.TokenID, "CREATE", "", token.Status, uuid.Nil, token.CurrentOwner, nil); err != nil {
		// Log error but don't fail the operation
		// In production, this should be logged properly
		fmt.Printf("Warning: failed to create audit entry: %v\n", err)
	}

	return nil
}

// GetByID retrieves a token by its ID
func (r *tokenRepository) GetByID(ctx context.Context, tokenID uuid.UUID) (*models.Token, error) {
	return r.GetByIDWithTx(ctx, nil, tokenID)
}

// GetByIDWithTx retrieves a token by its ID using an existing transaction
func (r *tokenRepository) GetByIDWithTx(ctx context.Context, tx *sql.Tx, tokenID uuid.UUID) (*models.Token, error) {
	query := `
		SELECT token_id, cbdc_type, denomination, current_owner, status,
			   issue_timestamp, transaction_history, metadata, compliance_flags,
			   created_at, updated_at
		FROM tokens
		WHERE token_id = $1`

	var token models.Token
	var err error

	if tx != nil {
		err = tx.QueryRowContext(ctx, query, tokenID).Scan(
			&token.TokenID,
			&token.CBDCType,
			&token.Denomination,
			&token.CurrentOwner,
			&token.Status,
			&token.IssueTimestamp,
			&token.TransactionHistory,
			&token.Metadata,
			&token.ComplianceFlags,
			&token.CreatedAt,
			&token.UpdatedAt,
		)
	} else {
		err = r.db.QueryRowContext(ctx, query, tokenID).Scan(
			&token.TokenID,
			&token.CBDCType,
			&token.Denomination,
			&token.CurrentOwner,
			&token.Status,
			&token.IssueTimestamp,
			&token.TransactionHistory,
			&token.Metadata,
			&token.ComplianceFlags,
			&token.CreatedAt,
			&token.UpdatedAt,
		)
	}

	if err != nil {
		if err == sql.ErrNoRows {
			return nil, nil // Token not found
		}
		return nil, fmt.Errorf("failed to get token: %w", err)
	}

	return &token, nil
}

// Update updates an existing token in the database
func (r *tokenRepository) Update(ctx context.Context, token *models.Token) error {
	return r.UpdateWithTx(ctx, nil, token)
}

// UpdateWithTx updates an existing token using an existing transaction
func (r *tokenRepository) UpdateWithTx(ctx context.Context, tx *sql.Tx, token *models.Token) error {
	// Get current token for audit trail
	currentToken, err := r.GetByIDWithTx(ctx, tx, token.TokenID)
	if err != nil {
		return fmt.Errorf("failed to get current token for audit: %w", err)
	}

	if currentToken == nil {
		return errors.NewTokenManagementError(
			errors.ErrTokenNotFound,
			"token not found for update",
		)
	}

	query := `
		UPDATE tokens SET
			cbdc_type = $2,
			denomination = $3,
			current_owner = $4,
			status = $5,
			issue_timestamp = $6,
			transaction_history = $7,
			metadata = $8,
			compliance_flags = $9,
			updated_at = $10
		WHERE token_id = $1`

	var execErr error
	if tx != nil {
		_, execErr = tx.ExecContext(ctx, query,
			token.TokenID,
			token.CBDCType,
			token.Denomination,
			token.CurrentOwner,
			token.Status,
			token.IssueTimestamp,
			token.TransactionHistory,
			token.Metadata,
			token.ComplianceFlags,
			token.UpdatedAt,
		)
	} else {
		_, execErr = r.db.ExecContext(ctx, query,
			token.TokenID,
			token.CBDCType,
			token.Denomination,
			token.CurrentOwner,
			token.Status,
			token.IssueTimestamp,
			token.TransactionHistory,
			token.Metadata,
			token.ComplianceFlags,
			token.UpdatedAt,
		)
	}

	if execErr != nil {
		return fmt.Errorf("failed to update token: %w", execErr)
	}

	// Create audit trail entry for status change
	if currentToken.Status != token.Status {
		if err := r.createAuditEntry(ctx, tx, token.TokenID, "STATUS_CHANGE", currentToken.Status, token.Status, uuid.Nil, uuid.Nil, nil); err != nil {
			fmt.Printf("Warning: failed to create status change audit entry: %v\n", err)
		}
	}

	// Create audit trail entry for ownership change
	if currentToken.CurrentOwner != token.CurrentOwner {
		if err := r.createAuditEntry(ctx, tx, token.TokenID, "OWNERSHIP_TRANSFER", "", "", currentToken.CurrentOwner, token.CurrentOwner, nil); err != nil {
			fmt.Printf("Warning: failed to create ownership transfer audit entry: %v\n", err)
		}
	}

	return nil
}

// GetByOwner retrieves all tokens owned by a specific owner
func (r *tokenRepository) GetByOwner(ctx context.Context, ownerID uuid.UUID) ([]models.Token, error) {
	query := `
		SELECT token_id, cbdc_type, denomination, current_owner, status,
			   issue_timestamp, transaction_history, metadata, compliance_flags,
			   created_at, updated_at
		FROM tokens
		WHERE current_owner = $1
		ORDER BY created_at DESC`

	rows, err := r.db.QueryContext(ctx, query, ownerID)
	if err != nil {
		return nil, fmt.Errorf("failed to query tokens by owner: %w", err)
	}
	defer rows.Close()

	var tokens []models.Token
	for rows.Next() {
		var token models.Token
		err := rows.Scan(
			&token.TokenID,
			&token.CBDCType,
			&token.Denomination,
			&token.CurrentOwner,
			&token.Status,
			&token.IssueTimestamp,
			&token.TransactionHistory,
			&token.Metadata,
			&token.ComplianceFlags,
			&token.CreatedAt,
			&token.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan token: %w", err)
		}
		tokens = append(tokens, token)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating token rows: %w", err)
	}

	return tokens, nil
}

// GetByStatus retrieves all tokens with a specific status
func (r *tokenRepository) GetByStatus(ctx context.Context, status models.TokenStatus) ([]models.Token, error) {
	query := `
		SELECT token_id, cbdc_type, denomination, current_owner, status,
			   issue_timestamp, transaction_history, metadata, compliance_flags,
			   created_at, updated_at
		FROM tokens
		WHERE status = $1
		ORDER BY created_at DESC`

	rows, err := r.db.QueryContext(ctx, query, status)
	if err != nil {
		return nil, fmt.Errorf("failed to query tokens by status: %w", err)
	}
	defer rows.Close()

	var tokens []models.Token
	for rows.Next() {
		var token models.Token
		err := rows.Scan(
			&token.TokenID,
			&token.CBDCType,
			&token.Denomination,
			&token.CurrentOwner,
			&token.Status,
			&token.IssueTimestamp,
			&token.TransactionHistory,
			&token.Metadata,
			&token.ComplianceFlags,
			&token.CreatedAt,
			&token.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan token: %w", err)
		}
		tokens = append(tokens, token)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating token rows: %w", err)
	}

	return tokens, nil
}

// GetByCBDCType retrieves all tokens of a specific CBDC type
func (r *tokenRepository) GetByCBDCType(ctx context.Context, cbdcType models.CBDCType) ([]models.Token, error) {
	query := `
		SELECT token_id, cbdc_type, denomination, current_owner, status,
			   issue_timestamp, transaction_history, metadata, compliance_flags,
			   created_at, updated_at
		FROM tokens
		WHERE cbdc_type = $1
		ORDER BY created_at DESC`

	rows, err := r.db.QueryContext(ctx, query, cbdcType)
	if err != nil {
		return nil, fmt.Errorf("failed to query tokens by CBDC type: %w", err)
	}
	defer rows.Close()

	var tokens []models.Token
	for rows.Next() {
		var token models.Token
		err := rows.Scan(
			&token.TokenID,
			&token.CBDCType,
			&token.Denomination,
			&token.CurrentOwner,
			&token.Status,
			&token.IssueTimestamp,
			&token.TransactionHistory,
			&token.Metadata,
			&token.ComplianceFlags,
			&token.CreatedAt,
			&token.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan token: %w", err)
		}
		tokens = append(tokens, token)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating token rows: %w", err)
	}

	return tokens, nil
}

// BulkUpdateStatus updates the status of multiple tokens atomically
func (r *tokenRepository) BulkUpdateStatus(ctx context.Context, tokenIDs []uuid.UUID, status models.TokenStatus) error {
	if len(tokenIDs) == 0 {
		return nil
	}

	// Use transaction for atomicity
	return r.db.Transaction(func(tx *sql.Tx) error {
		// Build placeholders for IN clause
		placeholders := make([]string, len(tokenIDs))
		args := make([]interface{}, len(tokenIDs)+1)
		
		for i, tokenID := range tokenIDs {
			placeholders[i] = fmt.Sprintf("$%d", i+1)
			args[i] = tokenID
		}
		args[len(tokenIDs)] = status

		query := fmt.Sprintf(`
			UPDATE tokens 
			SET status = $%d, updated_at = NOW()
			WHERE token_id IN (%s)`,
			len(tokenIDs)+1,
			strings.Join(placeholders, ","),
		)

		_, err := tx.ExecContext(ctx, query, args...)
		if err != nil {
			return fmt.Errorf("failed to bulk update token status: %w", err)
		}

		// Create audit entries for each token
		for _, tokenID := range tokenIDs {
			if err := r.createAuditEntry(ctx, tx, tokenID, "BULK_STATUS_UPDATE", "", status, uuid.Nil, uuid.Nil, map[string]interface{}{
				"bulk_operation": true,
				"token_count":    len(tokenIDs),
			}); err != nil {
				fmt.Printf("Warning: failed to create bulk update audit entry for token %s: %v\n", tokenID, err)
			}
		}

		return nil
	})
}

// GetAuditTrail retrieves the audit trail for a specific token
func (r *tokenRepository) GetAuditTrail(ctx context.Context, tokenID uuid.UUID) ([]TokenAuditEntry, error) {
	query := `
		SELECT id, token_id, operation, old_status, new_status, old_owner, new_owner, timestamp, metadata
		FROM token_audit_trail
		WHERE token_id = $1
		ORDER BY timestamp DESC`

	rows, err := r.db.QueryContext(ctx, query, tokenID)
	if err != nil {
		return nil, fmt.Errorf("failed to query audit trail: %w", err)
	}
	defer rows.Close()

	var entries []TokenAuditEntry
	for rows.Next() {
		var entry TokenAuditEntry
		err := rows.Scan(
			&entry.ID,
			&entry.TokenID,
			&entry.Operation,
			&entry.OldStatus,
			&entry.NewStatus,
			&entry.OldOwner,
			&entry.NewOwner,
			&entry.Timestamp,
			&entry.Metadata,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan audit entry: %w", err)
		}
		entries = append(entries, entry)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("error iterating audit trail rows: %w", err)
	}

	return entries, nil
}

// createAuditEntry creates an audit trail entry
func (r *tokenRepository) createAuditEntry(ctx context.Context, tx *sql.Tx, tokenID uuid.UUID, operation string, oldStatus, newStatus models.TokenStatus, oldOwner, newOwner uuid.UUID, metadata map[string]interface{}) error {
	query := `
		INSERT INTO token_audit_trail (
			id, token_id, operation, old_status, new_status, old_owner, new_owner, timestamp, metadata
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, NOW(), $8
		)`

	auditID := uuid.New()
	var err error

	if tx != nil {
		_, err = tx.ExecContext(ctx, query,
			auditID,
			tokenID,
			operation,
			oldStatus,
			newStatus,
			oldOwner,
			newOwner,
			metadata,
		)
	} else {
		_, err = r.db.ExecContext(ctx, query,
			auditID,
			tokenID,
			operation,
			oldStatus,
			newStatus,
			oldOwner,
			newOwner,
			metadata,
		)
	}

	return err
}