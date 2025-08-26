package repository

import (
	"database/sql"
	"time"

	"github.com/google/uuid"
	"echopay/shared/libraries/database"
	"echopay/shared/libraries/errors"
	"echopay/transaction-service/src/models"
)

// TransactionRepository handles database operations for transactions
type TransactionRepository struct {
	db *database.PostgresDB
}

// NewTransactionRepository creates a new transaction repository
func NewTransactionRepository(db *database.PostgresDB) *TransactionRepository {
	return &TransactionRepository{db: db}
}

// Create inserts a new transaction and its initial audit entry
func (r *TransactionRepository) Create(transaction *models.Transaction) error {
	return r.db.Transaction(func(tx *sql.Tx) error {
		return r.CreateInTx(tx, transaction)
	})
}

// CreateInTx inserts a new transaction within an existing transaction
func (r *TransactionRepository) CreateInTx(tx *sql.Tx, transaction *models.Transaction) error {
	// Insert transaction
	query := `
		INSERT INTO transactions (
			id, from_wallet_id, to_wallet_id, amount, currency, 
			status, fraud_score, created_at, settled_at, metadata
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`
	
	_, err := tx.Exec(query,
		transaction.ID,
		transaction.FromWallet,
		transaction.ToWallet,
		transaction.Amount,
		transaction.Currency,
		transaction.Status,
		transaction.FraudScore,
		transaction.CreatedAt,
		transaction.SettledAt,
		transaction.Metadata,
	)
	if err != nil {
		return errors.WrapError(err, errors.ErrTransactionFailed, "failed to insert transaction", "transaction-service")
	}

	// Insert audit trail entries
	for _, auditEntry := range transaction.AuditTrail {
		err = r.insertAuditEntry(tx, auditEntry)
		if err != nil {
			return err
		}
	}

	return nil
}

// GetByID retrieves a transaction by ID with its audit trail
func (r *TransactionRepository) GetByID(id uuid.UUID) (*models.Transaction, error) {
	// Get transaction
	query := `
		SELECT id, from_wallet_id, to_wallet_id, amount, currency, 
			   status, fraud_score, created_at, settled_at, metadata
		FROM transactions 
		WHERE id = $1
	`
	
	var transaction models.Transaction
	var fraudScore sql.NullFloat64
	var settledAt sql.NullTime
	
	err := r.db.QueryRow(query, id).Scan(
		&transaction.ID,
		&transaction.FromWallet,
		&transaction.ToWallet,
		&transaction.Amount,
		&transaction.Currency,
		&transaction.Status,
		&fraudScore,
		&transaction.CreatedAt,
		&settledAt,
		&transaction.Metadata,
	)
	
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, errors.NewTransactionError(errors.ErrTransactionNotFound, "transaction not found")
		}
		return nil, errors.WrapError(err, errors.ErrTransactionFailed, "failed to get transaction", "transaction-service")
	}
	
	// Handle nullable fields
	if fraudScore.Valid {
		transaction.FraudScore = &fraudScore.Float64
	}
	if settledAt.Valid {
		transaction.SettledAt = &settledAt.Time
	}
	
	// Load audit trail
	auditTrail, err := r.getAuditTrail(id)
	if err != nil {
		return nil, err
	}
	transaction.AuditTrail = auditTrail
	
	return &transaction, nil
}

// Update updates a transaction and adds new audit entries
func (r *TransactionRepository) Update(transaction *models.Transaction) error {
	return r.db.Transaction(func(tx *sql.Tx) error {
		// Update transaction
		query := `
			UPDATE transactions 
			SET status = $2, fraud_score = $3, settled_at = $4, metadata = $5
			WHERE id = $1
		`
		
		result, err := tx.Exec(query,
			transaction.ID,
			transaction.Status,
			transaction.FraudScore,
			transaction.SettledAt,
			transaction.Metadata,
		)
		if err != nil {
			return errors.WrapError(err, errors.ErrTransactionFailed, "failed to update transaction", "transaction-service")
		}
		
		rowsAffected, err := result.RowsAffected()
		if err != nil {
			return errors.WrapError(err, errors.ErrTransactionFailed, "failed to check update result", "transaction-service")
		}
		
		if rowsAffected == 0 {
			return errors.NewTransactionError(errors.ErrTransactionNotFound, "transaction not found for update")
		}

		// Get existing audit entries count to determine which are new
		var existingCount int
		err = tx.QueryRow("SELECT COUNT(*) FROM transaction_audit WHERE transaction_id = $1", transaction.ID).Scan(&existingCount)
		if err != nil {
			return errors.WrapError(err, errors.ErrTransactionFailed, "failed to count existing audit entries", "transaction-service")
		}

		// Insert new audit entries
		for i := existingCount; i < len(transaction.AuditTrail); i++ {
			err = r.insertAuditEntry(tx, transaction.AuditTrail[i])
			if err != nil {
				return err
			}
		}

		return nil
	})
}

// GetByWallet retrieves transactions for a specific wallet
func (r *TransactionRepository) GetByWallet(walletID uuid.UUID, limit, offset int) ([]*models.Transaction, error) {
	query := `
		SELECT id, from_wallet_id, to_wallet_id, amount, currency, 
			   status, fraud_score, created_at, settled_at, metadata
		FROM transactions 
		WHERE from_wallet_id = $1 OR to_wallet_id = $1
		ORDER BY created_at DESC
		LIMIT $2 OFFSET $3
	`
	
	rows, err := r.db.Query(query, walletID, limit, offset)
	if err != nil {
		return nil, errors.WrapError(err, errors.ErrTransactionFailed, "failed to get transactions by wallet", "transaction-service")
	}
	defer rows.Close()
	
	var transactions []*models.Transaction
	
	for rows.Next() {
		var transaction models.Transaction
		var fraudScore sql.NullFloat64
		var settledAt sql.NullTime
		
		err := rows.Scan(
			&transaction.ID,
			&transaction.FromWallet,
			&transaction.ToWallet,
			&transaction.Amount,
			&transaction.Currency,
			&transaction.Status,
			&fraudScore,
			&transaction.CreatedAt,
			&settledAt,
			&transaction.Metadata,
		)
		if err != nil {
			return nil, errors.WrapError(err, errors.ErrTransactionFailed, "failed to scan transaction", "transaction-service")
		}
		
		// Handle nullable fields
		if fraudScore.Valid {
			transaction.FraudScore = &fraudScore.Float64
		}
		if settledAt.Valid {
			transaction.SettledAt = &settledAt.Time
		}
		
		transactions = append(transactions, &transaction)
	}
	
	if err = rows.Err(); err != nil {
		return nil, errors.WrapError(err, errors.ErrTransactionFailed, "error iterating transactions", "transaction-service")
	}
	
	// Load audit trails for all transactions
	for _, transaction := range transactions {
		auditTrail, err := r.getAuditTrail(transaction.ID)
		if err != nil {
			return nil, err
		}
		transaction.AuditTrail = auditTrail
	}
	
	return transactions, nil
}

// GetPendingTransactions retrieves all pending transactions
func (r *TransactionRepository) GetPendingTransactions(limit int) ([]*models.Transaction, error) {
	query := `
		SELECT id, from_wallet_id, to_wallet_id, amount, currency, 
			   status, fraud_score, created_at, settled_at, metadata
		FROM transactions 
		WHERE status = $1
		ORDER BY created_at ASC
		LIMIT $2
	`
	
	rows, err := r.db.Query(query, models.StatusPending, limit)
	if err != nil {
		return nil, errors.WrapError(err, errors.ErrTransactionFailed, "failed to get pending transactions", "transaction-service")
	}
	defer rows.Close()
	
	var transactions []*models.Transaction
	
	for rows.Next() {
		var transaction models.Transaction
		var fraudScore sql.NullFloat64
		var settledAt sql.NullTime
		
		err := rows.Scan(
			&transaction.ID,
			&transaction.FromWallet,
			&transaction.ToWallet,
			&transaction.Amount,
			&transaction.Currency,
			&transaction.Status,
			&fraudScore,
			&transaction.CreatedAt,
			&settledAt,
			&transaction.Metadata,
		)
		if err != nil {
			return nil, errors.WrapError(err, errors.ErrTransactionFailed, "failed to scan pending transaction", "transaction-service")
		}
		
		// Handle nullable fields
		if fraudScore.Valid {
			transaction.FraudScore = &fraudScore.Float64
		}
		if settledAt.Valid {
			transaction.SettledAt = &settledAt.Time
		}
		
		transactions = append(transactions, &transaction)
	}
	
	if err = rows.Err(); err != nil {
		return nil, errors.WrapError(err, errors.ErrTransactionFailed, "error iterating pending transactions", "transaction-service")
	}
	
	return transactions, nil
}

// GetTransactionStats returns transaction statistics
func (r *TransactionRepository) GetTransactionStats(walletID uuid.UUID, since time.Time) (*TransactionStats, error) {
	query := `
		SELECT 
			COUNT(*) as total_count,
			COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
			COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
			COUNT(CASE WHEN status = 'reversed' THEN 1 END) as reversed_count,
			COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0) as total_amount,
			COALESCE(AVG(fraud_score), 0) as avg_fraud_score
		FROM transactions 
		WHERE (from_wallet_id = $1 OR to_wallet_id = $1) AND created_at >= $2
	`
	
	var stats TransactionStats
	err := r.db.QueryRow(query, walletID, since).Scan(
		&stats.TotalCount,
		&stats.CompletedCount,
		&stats.FailedCount,
		&stats.ReversedCount,
		&stats.TotalAmount,
		&stats.AvgFraudScore,
	)
	
	if err != nil {
		return nil, errors.WrapError(err, errors.ErrTransactionFailed, "failed to get transaction stats", "transaction-service")
	}
	
	return &stats, nil
}

// insertAuditEntry inserts an audit entry within a transaction
func (r *TransactionRepository) insertAuditEntry(tx *sql.Tx, entry models.AuditEntry) error {
	query := `
		INSERT INTO transaction_audit (
			id, transaction_id, action, previous_state, new_state, 
			timestamp, user_id, service_id, details, signature
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
	`
	
	_, err := tx.Exec(query,
		entry.ID,
		entry.TransactionID,
		entry.Action,
		entry.PreviousState,
		entry.NewState,
		entry.Timestamp,
		entry.UserID,
		entry.ServiceID,
		entry.Details,
		entry.Signature,
	)
	
	if err != nil {
		return errors.WrapError(err, errors.ErrTransactionFailed, "failed to insert audit entry", "transaction-service")
	}
	
	return nil
}

// getAuditTrail retrieves the audit trail for a transaction
func (r *TransactionRepository) getAuditTrail(transactionID uuid.UUID) ([]models.AuditEntry, error) {
	query := `
		SELECT id, transaction_id, action, previous_state, new_state, 
			   timestamp, user_id, service_id, details, signature
		FROM transaction_audit 
		WHERE transaction_id = $1
		ORDER BY timestamp ASC
	`
	
	rows, err := r.db.Query(query, transactionID)
	if err != nil {
		return nil, errors.WrapError(err, errors.ErrTransactionFailed, "failed to get audit trail", "transaction-service")
	}
	defer rows.Close()
	
	var auditTrail []models.AuditEntry
	
	for rows.Next() {
		var entry models.AuditEntry
		var userID sql.NullString
		
		err := rows.Scan(
			&entry.ID,
			&entry.TransactionID,
			&entry.Action,
			&entry.PreviousState,
			&entry.NewState,
			&entry.Timestamp,
			&userID,
			&entry.ServiceID,
			&entry.Details,
			&entry.Signature,
		)
		if err != nil {
			return nil, errors.WrapError(err, errors.ErrTransactionFailed, "failed to scan audit entry", "transaction-service")
		}
		
		// Handle nullable user ID
		if userID.Valid {
			userUUID, err := uuid.Parse(userID.String)
			if err != nil {
				return nil, errors.WrapError(err, errors.ErrTransactionFailed, "failed to parse user ID", "transaction-service")
			}
			entry.UserID = &userUUID
		}
		
		auditTrail = append(auditTrail, entry)
	}
	
	if err = rows.Err(); err != nil {
		return nil, errors.WrapError(err, errors.ErrTransactionFailed, "error iterating audit entries", "transaction-service")
	}
	
	return auditTrail, nil
}

// TransactionStats holds transaction statistics
type TransactionStats struct {
	TotalCount     int     `json:"total_count"`
	CompletedCount int     `json:"completed_count"`
	FailedCount    int     `json:"failed_count"`
	ReversedCount  int     `json:"reversed_count"`
	TotalAmount    float64 `json:"total_amount"`
	AvgFraudScore  float64 `json:"avg_fraud_score"`
}

// Migrate creates the necessary database tables
func (r *TransactionRepository) Migrate() error {
	migrations := []string{
		// Create transactions table
		`CREATE TABLE IF NOT EXISTS transactions (
			id UUID PRIMARY KEY,
			from_wallet_id UUID NOT NULL,
			to_wallet_id UUID NOT NULL,
			amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
			currency VARCHAR(20) NOT NULL,
			status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'reversed')),
			fraud_score DECIMAL(3,2) CHECK (fraud_score >= 0.0 AND fraud_score <= 1.0),
			created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
			settled_at TIMESTAMP WITH TIME ZONE,
			metadata JSONB,
			CONSTRAINT valid_wallets CHECK (from_wallet_id != to_wallet_id)
		)`,
		
		// Create transaction audit table
		`CREATE TABLE IF NOT EXISTS transaction_audit (
			id UUID PRIMARY KEY,
			transaction_id UUID NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
			action VARCHAR(50) NOT NULL,
			previous_state VARCHAR(100),
			new_state VARCHAR(100),
			timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
			user_id UUID,
			service_id VARCHAR(50) NOT NULL,
			details JSONB,
			signature VARCHAR(64) NOT NULL
		)`,
		
		// Create indexes for performance
		`CREATE INDEX IF NOT EXISTS idx_transactions_from_wallet ON transactions(from_wallet_id)`,
		`CREATE INDEX IF NOT EXISTS idx_transactions_to_wallet ON transactions(to_wallet_id)`,
		`CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status)`,
		`CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_transaction_audit_transaction_id ON transaction_audit(transaction_id)`,
		`CREATE INDEX IF NOT EXISTS idx_transaction_audit_timestamp ON transaction_audit(timestamp)`,
	}
	
	return r.db.Migrate(migrations)
}