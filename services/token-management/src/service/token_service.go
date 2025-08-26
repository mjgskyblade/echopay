package service

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	
	"echopay/shared/libraries/database"
	"echopay/shared/libraries/errors"
	"echopay/token-management/src/models"
	"echopay/token-management/src/repository"
)

// TokenService handles token lifecycle management
type TokenService struct {
	repo   repository.TokenRepository
	db     TransactionManager
}

// TransactionManager interface for database transactions
type TransactionManager interface {
	Transaction(fn func(*sql.Tx) error) error
}

// NewTokenService creates a new token service instance
func NewTokenService(db *database.PostgresDB) *TokenService {
	return &TokenService{
		repo: repository.NewTokenRepository(db),
		db:   db,
	}
}

// NewTokenServiceWithDeps creates a new token service with injected dependencies (for testing)
func NewTokenServiceWithDeps(repo repository.TokenRepository, db TransactionManager) *TokenService {
	return &TokenService{
		repo: repo,
		db:   db,
	}
}

// IssueTokenRequest represents a token issuance request
type IssueTokenRequest struct {
	CBDCType     models.CBDCType `json:"cbdc_type" binding:"required"`
	Denomination float64         `json:"denomination" binding:"required,gt=0"`
	Owner        uuid.UUID       `json:"owner" binding:"required"`
	Issuer       string          `json:"issuer" binding:"required"`
	Series       string          `json:"series" binding:"required"`
	Quantity     int             `json:"quantity" binding:"required,gt=0,lte=1000"`
}

// IssueTokenResponse represents the response from token issuance
type IssueTokenResponse struct {
	Tokens    []models.Token `json:"tokens"`
	Count     int            `json:"count"`
	IssuedAt  time.Time      `json:"issued_at"`
}

// TransferTokenRequest represents a token transfer request
type TransferTokenRequest struct {
	TokenID       uuid.UUID `json:"token_id" binding:"required"`
	NewOwner      uuid.UUID `json:"new_owner" binding:"required"`
	TransactionID uuid.UUID `json:"transaction_id" binding:"required"`
}

// TransferTokenResponse represents the response from token transfer
type TransferTokenResponse struct {
	Token         models.Token `json:"token"`
	PreviousOwner uuid.UUID    `json:"previous_owner"`
	TransferredAt time.Time    `json:"transferred_at"`
}

// IssueTokens creates new tokens and stores them in the distributed ledger
func (s *TokenService) IssueTokens(ctx context.Context, req IssueTokenRequest) (*IssueTokenResponse, error) {
	// Validate request first (before database operations)
	if err := s.validateIssueRequest(req); err != nil {
		return nil, err
	}

	var tokens []models.Token
	issuedAt := time.Now()

	// Use transaction to ensure atomicity
	err := s.db.Transaction(func(tx *sql.Tx) error {
		for i := 0; i < req.Quantity; i++ {
			// Create new token
			token, err := models.NewToken(
				req.CBDCType,
				req.Denomination,
				req.Owner,
				req.Issuer,
				req.Series,
			)
			if err != nil {
				return fmt.Errorf("failed to create token %d: %w", i+1, err)
			}

			// Store token in repository
			if err := s.repo.CreateWithTx(ctx, tx, token); err != nil {
				return fmt.Errorf("failed to store token %d: %w", i+1, err)
			}

			tokens = append(tokens, *token)
		}
		return nil
	})

	if err != nil {
		return nil, errors.NewTokenManagementError(
			errors.ErrTransactionFailed,
			fmt.Sprintf("failed to issue tokens: %v", err),
		)
	}

	return &IssueTokenResponse{
		Tokens:   tokens,
		Count:    len(tokens),
		IssuedAt: issuedAt,
	}, nil
}

// TransferToken transfers ownership of a token to a new owner
func (s *TokenService) TransferToken(ctx context.Context, req TransferTokenRequest) (*TransferTokenResponse, error) {
	// Validate request
	if err := s.validateTransferRequest(req); err != nil {
		return nil, err
	}

	var transferredToken models.Token
	var previousOwner uuid.UUID
	transferredAt := time.Now()

	// Use transaction to ensure atomicity
	err := s.db.Transaction(func(tx *sql.Tx) error {
		// Get current token
		token, err := s.repo.GetByIDWithTx(ctx, tx, req.TokenID)
		if err != nil {
			return fmt.Errorf("failed to get token: %w", err)
		}

		if token == nil {
			return errors.NewTokenManagementError(
				errors.ErrTokenNotFound,
				"token not found",
			)
		}

		// Store previous owner
		previousOwner = token.CurrentOwner

		// Verify ownership transfer is valid
		if err := s.validateOwnershipTransfer(token, req.NewOwner); err != nil {
			return err
		}

		// Transfer ownership
		if err := token.TransferOwnership(req.NewOwner, req.TransactionID); err != nil {
			return err // Preserve the original error from the model
		}

		// Update token in repository
		if err := s.repo.UpdateWithTx(ctx, tx, token); err != nil {
			return fmt.Errorf("failed to update token: %w", err)
		}

		transferredToken = *token
		return nil
	})

	if err != nil {
		// Check if it's already an EchoPayError and return it directly
		if echoPayErr, ok := err.(*errors.EchoPayError); ok {
			return nil, echoPayErr
		}
		
		return nil, errors.NewTokenManagementError(
			errors.ErrTokenTransferFailed,
			fmt.Sprintf("failed to transfer token: %v", err),
		)
	}

	return &TransferTokenResponse{
		Token:         transferredToken,
		PreviousOwner: previousOwner,
		TransferredAt: transferredAt,
	}, nil
}

// DestroyToken marks a token as invalid (irreversible destruction)
func (s *TokenService) DestroyToken(ctx context.Context, tokenID uuid.UUID) error {
	if tokenID == uuid.Nil {
		return errors.NewTokenManagementError(
			errors.ErrInvalidTokenState,
			"token ID cannot be nil",
		)
	}

	// Use transaction to ensure atomicity
	err := s.db.Transaction(func(tx *sql.Tx) error {
		// Get current token
		token, err := s.repo.GetByIDWithTx(ctx, tx, tokenID)
		if err != nil {
			return fmt.Errorf("failed to get token: %w", err)
		}

		if token == nil {
			return errors.NewTokenManagementError(
				errors.ErrTokenNotFound,
				"token not found",
			)
		}

		// Verify token can be destroyed
		if err := s.validateTokenDestruction(token); err != nil {
			return err
		}

		// Mark token as invalid
		if err := token.Invalidate(); err != nil {
			return err // Preserve the original error from the model
		}

		// Update token in repository
		if err := s.repo.UpdateWithTx(ctx, tx, token); err != nil {
			return fmt.Errorf("failed to update token: %w", err)
		}

		return nil
	})

	if err != nil {
		// Check if it's already an EchoPayError and return it directly
		if echoPayErr, ok := err.(*errors.EchoPayError); ok {
			return echoPayErr
		}
		
		return errors.NewTokenManagementError(
			errors.ErrTransactionFailed,
			fmt.Sprintf("failed to destroy token: %v", err),
		)
	}

	return nil
}

// GetToken retrieves a token by ID
func (s *TokenService) GetToken(ctx context.Context, tokenID uuid.UUID) (*models.Token, error) {
	if tokenID == uuid.Nil {
		return nil, errors.NewTokenManagementError(
			errors.ErrInvalidTokenState,
			"token ID cannot be nil",
		)
	}

	token, err := s.repo.GetByID(ctx, tokenID)
	if err != nil {
		return nil, fmt.Errorf("failed to get token: %w", err)
	}

	if token == nil {
		return nil, errors.NewTokenManagementError(
			errors.ErrTokenNotFound,
			"token not found",
		)
	}

	return token, nil
}

// GetTokensByOwner retrieves all tokens owned by a specific owner
func (s *TokenService) GetTokensByOwner(ctx context.Context, ownerID uuid.UUID) ([]models.Token, error) {
	if ownerID == uuid.Nil {
		return nil, errors.NewTokenManagementError(
			errors.ErrInvalidTokenState,
			"owner ID cannot be nil",
		)
	}

	tokens, err := s.repo.GetByOwner(ctx, ownerID)
	if err != nil {
		return nil, fmt.Errorf("failed to get tokens by owner: %w", err)
	}

	return tokens, nil
}

// VerifyOwnership verifies that a token is owned by a specific owner
func (s *TokenService) VerifyOwnership(ctx context.Context, tokenID, ownerID uuid.UUID) (bool, error) {
	token, err := s.GetToken(ctx, tokenID)
	if err != nil {
		return false, err
	}

	return token.CurrentOwner == ownerID, nil
}

// GetTokenHistory retrieves the transaction history for a token
func (s *TokenService) GetTokenHistory(ctx context.Context, tokenID uuid.UUID) ([]uuid.UUID, error) {
	token, err := s.GetToken(ctx, tokenID)
	if err != nil {
		return nil, err
	}

	return []uuid.UUID(token.TransactionHistory), nil
}

// FreezeTokenRequest represents a token freezing request
type FreezeTokenRequest struct {
	TokenID uuid.UUID `json:"token_id" binding:"required"`
	Reason  string    `json:"reason,omitempty"`
}

// FreezeTokenResponse represents the response from token freezing
type FreezeTokenResponse struct {
	Token     models.Token `json:"token"`
	FrozenAt  time.Time    `json:"frozen_at"`
	Reason    string       `json:"reason,omitempty"`
}

// UnfreezeTokenRequest represents a token unfreezing request
type UnfreezeTokenRequest struct {
	TokenID uuid.UUID `json:"token_id" binding:"required"`
	Reason  string    `json:"reason,omitempty"`
}

// UnfreezeTokenResponse represents the response from token unfreezing
type UnfreezeTokenResponse struct {
	Token      models.Token `json:"token"`
	UnfrozenAt time.Time    `json:"unfrozen_at"`
	Reason     string       `json:"reason,omitempty"`
}

// BulkStatusUpdateRequest represents a bulk status update request
type BulkStatusUpdateRequest struct {
	TokenIDs  []uuid.UUID        `json:"token_ids" binding:"required,min=1,max=1000"`
	NewStatus models.TokenStatus `json:"new_status" binding:"required"`
	Reason    string             `json:"reason,omitempty"`
}

// BulkStatusUpdateResponse represents the response from bulk status update
type BulkStatusUpdateResponse struct {
	UpdatedCount int                `json:"updated_count"`
	NewStatus    models.TokenStatus `json:"new_status"`
	UpdatedAt    time.Time          `json:"updated_at"`
	Reason       string             `json:"reason,omitempty"`
}

// FreezeToken freezes a token with atomic database operations
func (s *TokenService) FreezeToken(ctx context.Context, req FreezeTokenRequest) (*FreezeTokenResponse, error) {
	if req.TokenID == uuid.Nil {
		return nil, errors.NewTokenManagementError(
			errors.ErrInvalidTokenState,
			"token ID cannot be nil",
		)
	}

	var frozenToken models.Token
	frozenAt := time.Now()

	// Use transaction to ensure atomicity
	err := s.db.Transaction(func(tx *sql.Tx) error {
		// Get current token
		token, err := s.repo.GetByIDWithTx(ctx, tx, req.TokenID)
		if err != nil {
			return fmt.Errorf("failed to get token: %w", err)
		}

		if token == nil {
			return errors.NewTokenManagementError(
				errors.ErrTokenNotFound,
				"token not found",
			)
		}

		// Validate that token can be frozen
		if err := s.validateTokenFreeze(token); err != nil {
			return err
		}

		// Freeze the token
		if err := token.Freeze(); err != nil {
			return err // Preserve the original error from the model
		}

		// Update token in repository with timestamp logging
		if err := s.repo.UpdateWithTx(ctx, tx, token); err != nil {
			return fmt.Errorf("failed to update token: %w", err)
		}

		frozenToken = *token
		return nil
	})

	if err != nil {
		// Check if it's already an EchoPayError and return it directly
		if echoPayErr, ok := err.(*errors.EchoPayError); ok {
			return nil, echoPayErr
		}
		
		return nil, errors.NewTokenManagementError(
			errors.ErrTransactionFailed,
			fmt.Sprintf("failed to freeze token: %v", err),
		)
	}

	return &FreezeTokenResponse{
		Token:    frozenToken,
		FrozenAt: frozenAt,
		Reason:   req.Reason,
	}, nil
}

// UnfreezeToken unfreezes a token with atomic database operations
func (s *TokenService) UnfreezeToken(ctx context.Context, req UnfreezeTokenRequest) (*UnfreezeTokenResponse, error) {
	if req.TokenID == uuid.Nil {
		return nil, errors.NewTokenManagementError(
			errors.ErrInvalidTokenState,
			"token ID cannot be nil",
		)
	}

	var unfrozenToken models.Token
	unfrozenAt := time.Now()

	// Use transaction to ensure atomicity
	err := s.db.Transaction(func(tx *sql.Tx) error {
		// Get current token
		token, err := s.repo.GetByIDWithTx(ctx, tx, req.TokenID)
		if err != nil {
			return fmt.Errorf("failed to get token: %w", err)
		}

		if token == nil {
			return errors.NewTokenManagementError(
				errors.ErrTokenNotFound,
				"token not found",
			)
		}

		// Validate that token can be unfrozen
		if err := s.validateTokenUnfreeze(token); err != nil {
			return err
		}

		// Unfreeze the token
		if err := token.Unfreeze(); err != nil {
			return err // Preserve the original error from the model
		}

		// Update token in repository with timestamp logging
		if err := s.repo.UpdateWithTx(ctx, tx, token); err != nil {
			return fmt.Errorf("failed to update token: %w", err)
		}

		unfrozenToken = *token
		return nil
	})

	if err != nil {
		// Check if it's already an EchoPayError and return it directly
		if echoPayErr, ok := err.(*errors.EchoPayError); ok {
			return nil, echoPayErr
		}
		
		return nil, errors.NewTokenManagementError(
			errors.ErrTransactionFailed,
			fmt.Sprintf("failed to unfreeze token: %v", err),
		)
	}

	return &UnfreezeTokenResponse{
		Token:      unfrozenToken,
		UnfrozenAt: unfrozenAt,
		Reason:     req.Reason,
	}, nil
}

// BulkUpdateTokenStatus updates the status of multiple tokens atomically for efficient reversibility processing
func (s *TokenService) BulkUpdateTokenStatus(ctx context.Context, req BulkStatusUpdateRequest) (*BulkStatusUpdateResponse, error) {
	// Validate request
	if err := s.validateBulkStatusUpdateRequest(req); err != nil {
		return nil, err
	}

	updatedAt := time.Now()

	// Use repository's bulk update method which handles transactions internally
	err := s.repo.BulkUpdateStatus(ctx, req.TokenIDs, req.NewStatus)
	if err != nil {
		return nil, errors.NewTokenManagementError(
			errors.ErrTransactionFailed,
			fmt.Sprintf("failed to bulk update token status: %v", err),
		)
	}

	return &BulkStatusUpdateResponse{
		UpdatedCount: len(req.TokenIDs),
		NewStatus:    req.NewStatus,
		UpdatedAt:    updatedAt,
		Reason:       req.Reason,
	}, nil
}

// GetTokensByStatus retrieves all tokens with a specific status
func (s *TokenService) GetTokensByStatus(ctx context.Context, status models.TokenStatus) ([]models.Token, error) {
	// Validate status
	validStatuses := map[models.TokenStatus]bool{
		models.TokenStatusActive:   true,
		models.TokenStatusFrozen:   true,
		models.TokenStatusDisputed: true,
		models.TokenStatusInvalid:  true,
	}

	if !validStatuses[status] {
		return nil, errors.NewTokenManagementError(
			errors.ErrInvalidTokenState,
			fmt.Sprintf("invalid token status: %s", status),
		)
	}

	tokens, err := s.repo.GetByStatus(ctx, status)
	if err != nil {
		return nil, fmt.Errorf("failed to get tokens by status: %w", err)
	}

	return tokens, nil
}

// GetTokenAuditTrail retrieves the complete audit trail for a token
func (s *TokenService) GetTokenAuditTrail(ctx context.Context, tokenID uuid.UUID) ([]repository.TokenAuditEntry, error) {
	if tokenID == uuid.Nil {
		return nil, errors.NewTokenManagementError(
			errors.ErrInvalidTokenState,
			"token ID cannot be nil",
		)
	}

	auditTrail, err := s.repo.GetAuditTrail(ctx, tokenID)
	if err != nil {
		return nil, fmt.Errorf("failed to get token audit trail: %w", err)
	}

	return auditTrail, nil
}

// BulkFreezeTokens freezes multiple tokens atomically for efficient fraud response
func (s *TokenService) BulkFreezeTokens(ctx context.Context, tokenIDs []uuid.UUID, reason string) (*BulkStatusUpdateResponse, error) {
	if len(tokenIDs) == 0 {
		return nil, errors.NewTokenManagementError(
			errors.ErrInvalidTokenState,
			"token IDs list cannot be empty",
		)
	}

	if len(tokenIDs) > 1000 {
		return nil, errors.NewTokenManagementError(
			errors.ErrInvalidTokenState,
			"cannot freeze more than 1000 tokens at once",
		)
	}

	req := BulkStatusUpdateRequest{
		TokenIDs:  tokenIDs,
		NewStatus: models.TokenStatusFrozen,
		Reason:    reason,
	}

	return s.BulkUpdateTokenStatus(ctx, req)
}

// BulkUnfreezeTokens unfreezes multiple tokens atomically for efficient fraud resolution
func (s *TokenService) BulkUnfreezeTokens(ctx context.Context, tokenIDs []uuid.UUID, reason string) (*BulkStatusUpdateResponse, error) {
	if len(tokenIDs) == 0 {
		return nil, errors.NewTokenManagementError(
			errors.ErrInvalidTokenState,
			"token IDs list cannot be empty",
		)
	}

	if len(tokenIDs) > 1000 {
		return nil, errors.NewTokenManagementError(
			errors.ErrInvalidTokenState,
			"cannot unfreeze more than 1000 tokens at once",
		)
	}

	req := BulkStatusUpdateRequest{
		TokenIDs:  tokenIDs,
		NewStatus: models.TokenStatusActive,
		Reason:    reason,
	}

	return s.BulkUpdateTokenStatus(ctx, req)
}

// Validation helper methods

func (s *TokenService) validateIssueRequest(req IssueTokenRequest) error {
	if req.CBDCType == "" {
		return errors.NewTokenManagementError(
			errors.ErrInvalidTokenState,
			"CBDC type is required",
		)
	}

	// Validate CBDC type
	validTypes := map[models.CBDCType]bool{
		models.CBDCTypeUSD: true,
		models.CBDCTypeEUR: true,
		models.CBDCTypeGBP: true,
	}
	
	if !validTypes[req.CBDCType] {
		return errors.NewTokenManagementError(
			errors.ErrInvalidTokenState,
			fmt.Sprintf("invalid CBDC type: %s", req.CBDCType),
		)
	}

	if req.Denomination <= 0 {
		return errors.NewTokenManagementError(
			errors.ErrInvalidTokenState,
			"denomination must be greater than 0",
		)
	}

	if req.Denomination < 0.01 {
		return errors.NewTokenManagementError(
			errors.ErrInvalidTokenState,
			"denomination must be at least 0.01",
		)
	}

	if req.Owner == uuid.Nil {
		return errors.NewTokenManagementError(
			errors.ErrInvalidTokenState,
			"owner is required",
		)
	}

	if req.Issuer == "" {
		return errors.NewTokenManagementError(
			errors.ErrInvalidTokenState,
			"issuer is required",
		)
	}

	if req.Series == "" {
		return errors.NewTokenManagementError(
			errors.ErrInvalidTokenState,
			"series is required",
		)
	}

	if req.Quantity <= 0 || req.Quantity > 1000 {
		return errors.NewTokenManagementError(
			errors.ErrInvalidTokenState,
			"quantity must be between 1 and 1000",
		)
	}

	return nil
}

func (s *TokenService) validateTransferRequest(req TransferTokenRequest) error {
	if req.TokenID == uuid.Nil {
		return errors.NewTokenManagementError(
			errors.ErrInvalidTokenState,
			"token ID is required",
		)
	}

	if req.NewOwner == uuid.Nil {
		return errors.NewTokenManagementError(
			errors.ErrInvalidTokenState,
			"new owner is required",
		)
	}

	if req.TransactionID == uuid.Nil {
		return errors.NewTokenManagementError(
			errors.ErrInvalidTokenState,
			"transaction ID is required",
		)
	}

	return nil
}

func (s *TokenService) validateOwnershipTransfer(token *models.Token, newOwner uuid.UUID) error {
	// Check if token can be transferred
	if !token.IsTransferable() {
		return errors.NewTokenManagementError(
			errors.ErrTokenFrozen,
			fmt.Sprintf("token in status %s cannot be transferred", token.Status),
		)
	}

	// Check if new owner is different from current owner
	if token.CurrentOwner == newOwner {
		return errors.NewTokenManagementError(
			errors.ErrInvalidTokenState,
			"new owner must be different from current owner",
		)
	}

	return nil
}

func (s *TokenService) validateTokenDestruction(token *models.Token) error {
	// Tokens can be destroyed from any state except invalid
	if token.IsInvalid() {
		return errors.NewTokenManagementError(
			errors.ErrInvalidTokenState,
			"token is already invalid",
		)
	}

	return nil
}

func (s *TokenService) validateTokenFreeze(token *models.Token) error {
	// Check if token is already frozen
	if token.IsFrozen() {
		return errors.NewTokenManagementError(
			errors.ErrInvalidTokenState,
			"token is already frozen",
		)
	}

	// Check if token is invalid (cannot freeze invalid tokens)
	if token.IsInvalid() {
		return errors.NewTokenManagementError(
			errors.ErrInvalidTokenState,
			"cannot freeze invalid token",
		)
	}

	return nil
}

func (s *TokenService) validateTokenUnfreeze(token *models.Token) error {
	// Check if token is not frozen
	if !token.IsFrozen() {
		return errors.NewTokenManagementError(
			errors.ErrInvalidTokenState,
			"token is not frozen",
		)
	}

	return nil
}

func (s *TokenService) validateBulkStatusUpdateRequest(req BulkStatusUpdateRequest) error {
	if len(req.TokenIDs) == 0 {
		return errors.NewTokenManagementError(
			errors.ErrInvalidTokenState,
			"token IDs list cannot be empty",
		)
	}

	if len(req.TokenIDs) > 1000 {
		return errors.NewTokenManagementError(
			errors.ErrInvalidTokenState,
			"cannot update more than 1000 tokens at once",
		)
	}

	// Validate status
	validStatuses := map[models.TokenStatus]bool{
		models.TokenStatusActive:   true,
		models.TokenStatusFrozen:   true,
		models.TokenStatusDisputed: true,
		models.TokenStatusInvalid:  true,
	}

	if !validStatuses[req.NewStatus] {
		return errors.NewTokenManagementError(
			errors.ErrInvalidTokenState,
			fmt.Sprintf("invalid token status: %s", req.NewStatus),
		)
	}

	// Check for duplicate token IDs
	seen := make(map[uuid.UUID]bool)
	for _, tokenID := range req.TokenIDs {
		if tokenID == uuid.Nil {
			return errors.NewTokenManagementError(
				errors.ErrInvalidTokenState,
				"token ID cannot be nil",
			)
		}
		
		if seen[tokenID] {
			return errors.NewTokenManagementError(
				errors.ErrInvalidTokenState,
				fmt.Sprintf("duplicate token ID found: %s", tokenID),
			)
		}
		seen[tokenID] = true
	}

	return nil
}