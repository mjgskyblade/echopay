package repository

import (
	"database/sql"
	"time"

	"github.com/google/uuid"
	"echopay/shared/libraries/database"
	"echopay/shared/libraries/errors"
	"echopay/transaction-service/src/models"
)

// WalletBalance represents a wallet's current balance
type WalletBalance struct {
	WalletID uuid.UUID `json:"wallet_id"`
	Currency models.Currency `json:"currency"`
	Balance  float64 `json:"balance"`
	UpdatedAt time.Time `json:"updated_at"`
}

// WalletBalanceRepository handles wallet balance operations
type WalletBalanceRepository struct {
	db *database.PostgresDB
}

// NewWalletBalanceRepository creates a new wallet balance repository
func NewWalletBalanceRepository(db *database.PostgresDB) *WalletBalanceRepository {
	return &WalletBalanceRepository{db: db}
}

// GetBalance retrieves the current balance for a wallet and currency
func (r *WalletBalanceRepository) GetBalance(walletID uuid.UUID, currency models.Currency) (*WalletBalance, error) {
	query := `
		SELECT wallet_id, currency, balance, updated_at
		FROM wallet_balances 
		WHERE wallet_id = $1 AND currency = $2
	`
	
	var balance WalletBalance
	err := r.db.QueryRow(query, walletID, currency).Scan(
		&balance.WalletID,
		&balance.Currency,
		&balance.Balance,
		&balance.UpdatedAt,
	)
	
	if err != nil {
		if err == sql.ErrNoRows {
			// Create zero balance if wallet doesn't exist
			return r.createZeroBalance(walletID, currency)
		}
		return nil, errors.WrapError(err, errors.ErrTransactionFailed, "failed to get wallet balance", "transaction-service")
	}
	
	return &balance, nil
}

// GetBalanceForUpdate retrieves balance with row-level locking for atomic updates
func (r *WalletBalanceRepository) GetBalanceForUpdate(tx *sql.Tx, walletID uuid.UUID, currency models.Currency) (*WalletBalance, error) {
	query := `
		SELECT wallet_id, currency, balance, updated_at
		FROM wallet_balances 
		WHERE wallet_id = $1 AND currency = $2
		FOR UPDATE
	`
	
	var balance WalletBalance
	err := tx.QueryRow(query, walletID, currency).Scan(
		&balance.WalletID,
		&balance.Currency,
		&balance.Balance,
		&balance.UpdatedAt,
	)
	
	if err != nil {
		if err == sql.ErrNoRows {
			// Create zero balance if wallet doesn't exist
			return r.createZeroBalanceInTx(tx, walletID, currency)
		}
		return nil, errors.WrapError(err, errors.ErrTransactionFailed, "failed to get wallet balance for update", "transaction-service")
	}
	
	return &balance, nil
}

// UpdateBalance updates the balance for a wallet and currency
func (r *WalletBalanceRepository) UpdateBalance(tx *sql.Tx, walletID uuid.UUID, currency models.Currency, newBalance float64) error {
	query := `
		UPDATE wallet_balances 
		SET balance = $3, updated_at = NOW()
		WHERE wallet_id = $1 AND currency = $2
	`
	
	result, err := tx.Exec(query, walletID, currency, newBalance)
	if err != nil {
		return errors.WrapError(err, errors.ErrTransactionFailed, "failed to update wallet balance", "transaction-service")
	}
	
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return errors.WrapError(err, errors.ErrTransactionFailed, "failed to check update result", "transaction-service")
	}
	
	if rowsAffected == 0 {
		return errors.NewTransactionError(errors.ErrTransactionFailed, "wallet balance not found for update")
	}
	
	return nil
}

// CreateWallet creates a new wallet with zero balances for all supported currencies
func (r *WalletBalanceRepository) CreateWallet(walletID uuid.UUID) error {
	currencies := []models.Currency{models.USDCBDC, models.EURCBDC, models.GBPCBDC}
	
	return r.db.Transaction(func(tx *sql.Tx) error {
		for _, currency := range currencies {
			query := `
				INSERT INTO wallet_balances (wallet_id, currency, balance, updated_at)
				VALUES ($1, $2, 0.0, NOW())
				ON CONFLICT (wallet_id, currency) DO NOTHING
			`
			
			_, err := tx.Exec(query, walletID, currency)
			if err != nil {
				return errors.WrapError(err, errors.ErrTransactionFailed, "failed to create wallet balance", "transaction-service")
			}
		}
		return nil
	})
}

// GetWalletBalances retrieves all balances for a wallet
func (r *WalletBalanceRepository) GetWalletBalances(walletID uuid.UUID) ([]*WalletBalance, error) {
	query := `
		SELECT wallet_id, currency, balance, updated_at
		FROM wallet_balances 
		WHERE wallet_id = $1
		ORDER BY currency
	`
	
	rows, err := r.db.Query(query, walletID)
	if err != nil {
		return nil, errors.WrapError(err, errors.ErrTransactionFailed, "failed to get wallet balances", "transaction-service")
	}
	defer rows.Close()
	
	var balances []*WalletBalance
	
	for rows.Next() {
		var balance WalletBalance
		err := rows.Scan(
			&balance.WalletID,
			&balance.Currency,
			&balance.Balance,
			&balance.UpdatedAt,
		)
		if err != nil {
			return nil, errors.WrapError(err, errors.ErrTransactionFailed, "failed to scan wallet balance", "transaction-service")
		}
		
		balances = append(balances, &balance)
	}
	
	if err = rows.Err(); err != nil {
		return nil, errors.WrapError(err, errors.ErrTransactionFailed, "error iterating wallet balances", "transaction-service")
	}
	
	// If no balances found, create them
	if len(balances) == 0 {
		err = r.CreateWallet(walletID)
		if err != nil {
			return nil, err
		}
		// Retry getting balances
		return r.GetWalletBalances(walletID)
	}
	
	return balances, nil
}

// AddFunds adds funds to a wallet (for testing and initial funding)
func (r *WalletBalanceRepository) AddFunds(walletID uuid.UUID, currency models.Currency, amount float64) error {
	if amount <= 0 {
		return errors.NewTransactionError(errors.ErrInvalidTransaction, "amount must be positive")
	}
	
	return r.db.Transaction(func(tx *sql.Tx) error {
		// Get current balance with lock
		var currentBalance float64
		query := `
			SELECT balance FROM wallet_balances 
			WHERE wallet_id = $1 AND currency = $2
			FOR UPDATE
		`
		
		err := tx.QueryRow(query, walletID, currency).Scan(&currentBalance)
		if err != nil {
			if err == sql.ErrNoRows {
				// Create wallet if it doesn't exist
				_, err = tx.Exec(`
					INSERT INTO wallet_balances (wallet_id, currency, balance, updated_at)
					VALUES ($1, $2, $3, NOW())
				`, walletID, currency, amount)
				return err
			}
			return errors.WrapError(err, errors.ErrTransactionFailed, "failed to get current balance", "transaction-service")
		}
		
		// Update balance
		newBalance := currentBalance + amount
		_, err = tx.Exec(`
			UPDATE wallet_balances 
			SET balance = $3, updated_at = NOW()
			WHERE wallet_id = $1 AND currency = $2
		`, walletID, currency, newBalance)
		
		if err != nil {
			return errors.WrapError(err, errors.ErrTransactionFailed, "failed to add funds", "transaction-service")
		}
		
		return nil
	})
}

// GetTotalBalance returns the total balance across all currencies (converted to USD equivalent)
func (r *WalletBalanceRepository) GetTotalBalance(walletID uuid.UUID) (float64, error) {
	// For simplicity, assume 1:1 conversion rates for all CBDCs
	// In production, this would use real-time exchange rates
	query := `
		SELECT COALESCE(SUM(balance), 0) as total_balance
		FROM wallet_balances 
		WHERE wallet_id = $1
	`
	
	var totalBalance float64
	err := r.db.QueryRow(query, walletID).Scan(&totalBalance)
	if err != nil {
		return 0, errors.WrapError(err, errors.ErrTransactionFailed, "failed to get total balance", "transaction-service")
	}
	
	return totalBalance, nil
}

// createZeroBalance creates a zero balance entry for a new wallet
func (r *WalletBalanceRepository) createZeroBalance(walletID uuid.UUID, currency models.Currency) (*WalletBalance, error) {
	query := `
		INSERT INTO wallet_balances (wallet_id, currency, balance, updated_at)
		VALUES ($1, $2, 0.0, NOW())
		ON CONFLICT (wallet_id, currency) DO NOTHING
		RETURNING wallet_id, currency, balance, updated_at
	`
	
	var balance WalletBalance
	err := r.db.QueryRow(query, walletID, currency).Scan(
		&balance.WalletID,
		&balance.Currency,
		&balance.Balance,
		&balance.UpdatedAt,
	)
	
	if err != nil {
		// If conflict occurred, get the existing balance
		if err == sql.ErrNoRows {
			return r.GetBalance(walletID, currency)
		}
		return nil, errors.WrapError(err, errors.ErrTransactionFailed, "failed to create zero balance", "transaction-service")
	}
	
	return &balance, nil
}

// createZeroBalanceInTx creates a zero balance entry within a transaction
func (r *WalletBalanceRepository) createZeroBalanceInTx(tx *sql.Tx, walletID uuid.UUID, currency models.Currency) (*WalletBalance, error) {
	query := `
		INSERT INTO wallet_balances (wallet_id, currency, balance, updated_at)
		VALUES ($1, $2, 0.0, NOW())
		ON CONFLICT (wallet_id, currency) DO NOTHING
		RETURNING wallet_id, currency, balance, updated_at
	`
	
	var balance WalletBalance
	err := tx.QueryRow(query, walletID, currency).Scan(
		&balance.WalletID,
		&balance.Currency,
		&balance.Balance,
		&balance.UpdatedAt,
	)
	
	if err != nil {
		// If conflict occurred, get the existing balance
		if err == sql.ErrNoRows {
			return r.GetBalanceForUpdate(tx, walletID, currency)
		}
		return nil, errors.WrapError(err, errors.ErrTransactionFailed, "failed to create zero balance in transaction", "transaction-service")
	}
	
	return &balance, nil
}

// Migrate creates the wallet_balances table
func (r *WalletBalanceRepository) Migrate() error {
	migrations := []string{
		// Create wallet_balances table
		`CREATE TABLE IF NOT EXISTS wallet_balances (
			wallet_id UUID NOT NULL,
			currency VARCHAR(20) NOT NULL,
			balance DECIMAL(15,2) NOT NULL DEFAULT 0.0 CHECK (balance >= 0),
			updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
			PRIMARY KEY (wallet_id, currency)
		)`,
		
		// Create indexes for performance
		`CREATE INDEX IF NOT EXISTS idx_wallet_balances_wallet_id ON wallet_balances(wallet_id)`,
		`CREATE INDEX IF NOT EXISTS idx_wallet_balances_updated_at ON wallet_balances(updated_at)`,
	}
	
	return r.db.Migrate(migrations)
}