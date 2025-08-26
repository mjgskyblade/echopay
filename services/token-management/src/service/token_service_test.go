package service

import (
	"context"
	"database/sql"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	
	"echopay/shared/libraries/errors"
	"echopay/token-management/src/models"
	"echopay/token-management/src/repository"
)

// MockTokenRepository is a mock implementation of TokenRepository
type MockTokenRepository struct {
	mock.Mock
}

func (m *MockTokenRepository) Create(ctx context.Context, token *models.Token) error {
	args := m.Called(ctx, token)
	return args.Error(0)
}

func (m *MockTokenRepository) CreateWithTx(ctx context.Context, tx *sql.Tx, token *models.Token) error {
	args := m.Called(ctx, tx, token)
	return args.Error(0)
}

func (m *MockTokenRepository) GetByID(ctx context.Context, tokenID uuid.UUID) (*models.Token, error) {
	args := m.Called(ctx, tokenID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Token), args.Error(1)
}

func (m *MockTokenRepository) GetByIDWithTx(ctx context.Context, tx *sql.Tx, tokenID uuid.UUID) (*models.Token, error) {
	args := m.Called(ctx, tx, tokenID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*models.Token), args.Error(1)
}

func (m *MockTokenRepository) Update(ctx context.Context, token *models.Token) error {
	args := m.Called(ctx, token)
	return args.Error(0)
}

func (m *MockTokenRepository) UpdateWithTx(ctx context.Context, tx *sql.Tx, token *models.Token) error {
	args := m.Called(ctx, tx, token)
	return args.Error(0)
}

func (m *MockTokenRepository) GetByOwner(ctx context.Context, ownerID uuid.UUID) ([]models.Token, error) {
	args := m.Called(ctx, ownerID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]models.Token), args.Error(1)
}

func (m *MockTokenRepository) GetByStatus(ctx context.Context, status models.TokenStatus) ([]models.Token, error) {
	args := m.Called(ctx, status)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]models.Token), args.Error(1)
}

func (m *MockTokenRepository) GetByCBDCType(ctx context.Context, cbdcType models.CBDCType) ([]models.Token, error) {
	args := m.Called(ctx, cbdcType)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]models.Token), args.Error(1)
}

func (m *MockTokenRepository) BulkUpdateStatus(ctx context.Context, tokenIDs []uuid.UUID, status models.TokenStatus) error {
	args := m.Called(ctx, tokenIDs, status)
	return args.Error(0)
}

func (m *MockTokenRepository) GetAuditTrail(ctx context.Context, tokenID uuid.UUID) ([]repository.TokenAuditEntry, error) {
	args := m.Called(ctx, tokenID)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).([]repository.TokenAuditEntry), args.Error(1)
}

// MockDatabase is a mock implementation of database transaction functionality
type MockDatabase struct {
	mock.Mock
}

func (m *MockDatabase) Transaction(fn func(*sql.Tx) error) error {
	args := m.Called(fn)
	if args.Get(0) == nil {
		return fn(nil) // Execute the function with nil tx for testing
	}
	return args.Error(0)
}

func TestTokenService_IssueTokens(t *testing.T) {
	tests := []struct {
		name        string
		request     IssueTokenRequest
		setupMocks  func(*MockTokenRepository, *MockDatabase)
		expectError bool
		errorType   string
	}{
		{
			name: "successful token issuance",
			request: IssueTokenRequest{
				CBDCType:     models.CBDCTypeUSD,
				Denomination: 100.0,
				Owner:        uuid.New(),
				Issuer:       "Federal Reserve",
				Series:       "2025-A",
				Quantity:     5,
			},
			setupMocks: func(repo *MockTokenRepository, db *MockDatabase) {
				db.On("Transaction", mock.AnythingOfType("func(*sql.Tx) error")).Return(nil)
				repo.On("CreateWithTx", mock.Anything, mock.Anything, mock.AnythingOfType("*models.Token")).Return(nil).Times(5)
			},
			expectError: false,
		},
		{
			name: "invalid CBDC type",
			request: IssueTokenRequest{
				CBDCType:     "INVALID-CBDC",
				Denomination: 100.0,
				Owner:        uuid.New(),
				Issuer:       "Federal Reserve",
				Series:       "2025-A",
				Quantity:     1,
			},
			setupMocks: func(repo *MockTokenRepository, db *MockDatabase) {
				// No database calls expected for validation errors
			},
			expectError: true,
			errorType:   errors.ErrInvalidTokenState,
		},
		{
			name: "zero denomination",
			request: IssueTokenRequest{
				CBDCType:     models.CBDCTypeUSD,
				Denomination: 0,
				Owner:        uuid.New(),
				Issuer:       "Federal Reserve",
				Series:       "2025-A",
				Quantity:     1,
			},
			setupMocks:  func(repo *MockTokenRepository, db *MockDatabase) {},
			expectError: true,
			errorType:   errors.ErrInvalidTokenState,
		},
		{
			name: "nil owner",
			request: IssueTokenRequest{
				CBDCType:     models.CBDCTypeUSD,
				Denomination: 100.0,
				Owner:        uuid.Nil,
				Issuer:       "Federal Reserve",
				Series:       "2025-A",
				Quantity:     1,
			},
			setupMocks:  func(repo *MockTokenRepository, db *MockDatabase) {},
			expectError: true,
			errorType:   errors.ErrInvalidTokenState,
		},
		{
			name: "empty issuer",
			request: IssueTokenRequest{
				CBDCType:     models.CBDCTypeUSD,
				Denomination: 100.0,
				Owner:        uuid.New(),
				Issuer:       "",
				Series:       "2025-A",
				Quantity:     1,
			},
			setupMocks:  func(repo *MockTokenRepository, db *MockDatabase) {},
			expectError: true,
			errorType:   errors.ErrInvalidTokenState,
		},
		{
			name: "quantity too high",
			request: IssueTokenRequest{
				CBDCType:     models.CBDCTypeUSD,
				Denomination: 100.0,
				Owner:        uuid.New(),
				Issuer:       "Federal Reserve",
				Series:       "2025-A",
				Quantity:     1001,
			},
			setupMocks:  func(repo *MockTokenRepository, db *MockDatabase) {},
			expectError: true,
			errorType:   errors.ErrInvalidTokenState,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockRepo := new(MockTokenRepository)
			mockDB := new(MockDatabase)
			
			// Create a service with mocked dependencies
			service := NewTokenServiceWithDeps(mockRepo, mockDB)

			tt.setupMocks(mockRepo, mockDB)

			response, err := service.IssueTokens(context.Background(), tt.request)

			if tt.expectError {
				assert.Error(t, err)
				assert.Nil(t, response)
				
				if tt.errorType != "" {
					tokenErr, ok := err.(*errors.EchoPayError)
					assert.True(t, ok, "Expected EchoPayError")
					assert.Equal(t, tt.errorType, tokenErr.Code)
				}
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, response)
				assert.Equal(t, tt.request.Quantity, response.Count)
				assert.Equal(t, tt.request.Quantity, len(response.Tokens))
				
				// Verify all tokens have correct properties
				for _, token := range response.Tokens {
					assert.Equal(t, tt.request.CBDCType, token.CBDCType)
					assert.Equal(t, tt.request.Denomination, token.Denomination)
					assert.Equal(t, tt.request.Owner, token.CurrentOwner)
					assert.Equal(t, models.TokenStatusActive, token.Status)
					assert.Equal(t, tt.request.Issuer, token.Metadata.Issuer)
					assert.Equal(t, tt.request.Series, token.Metadata.Series)
				}
			}

			mockRepo.AssertExpectations(t)
			mockDB.AssertExpectations(t)
		})
	}
}

func TestTokenService_TransferToken(t *testing.T) {
	tokenID := uuid.New()
	currentOwner := uuid.New()
	newOwner := uuid.New()
	transactionID := uuid.New()

	tests := []struct {
		name        string
		request     TransferTokenRequest
		setupMocks  func(*MockTokenRepository, *MockDatabase)
		expectError bool
		errorType   string
	}{
		{
			name: "successful token transfer",
			request: TransferTokenRequest{
				TokenID:       tokenID,
				NewOwner:      newOwner,
				TransactionID: transactionID,
			},
			setupMocks: func(repo *MockTokenRepository, db *MockDatabase) {
				token := &models.Token{
					TokenID:      tokenID,
					CBDCType:     models.CBDCTypeUSD,
					Denomination: 100.0,
					CurrentOwner: currentOwner,
					Status:       models.TokenStatusActive,
					CreatedAt:    time.Now(),
					UpdatedAt:    time.Now(),
				}
				
				db.On("Transaction", mock.AnythingOfType("func(*sql.Tx) error")).Return(nil)
				repo.On("GetByIDWithTx", mock.Anything, mock.Anything, tokenID).Return(token, nil)
				repo.On("UpdateWithTx", mock.Anything, mock.Anything, mock.AnythingOfType("*models.Token")).Return(nil)
			},
			expectError: false,
		},
		{
			name: "token not found",
			request: TransferTokenRequest{
				TokenID:       tokenID,
				NewOwner:      newOwner,
				TransactionID: transactionID,
			},
			setupMocks: func(repo *MockTokenRepository, db *MockDatabase) {
				db.On("Transaction", mock.AnythingOfType("func(*sql.Tx) error")).Return(nil)
				repo.On("GetByIDWithTx", mock.Anything, mock.Anything, tokenID).Return(nil, nil)
			},
			expectError: true,
			errorType:   errors.ErrTokenNotFound,
		},
		{
			name: "frozen token transfer",
			request: TransferTokenRequest{
				TokenID:       tokenID,
				NewOwner:      newOwner,
				TransactionID: transactionID,
			},
			setupMocks: func(repo *MockTokenRepository, db *MockDatabase) {
				token := &models.Token{
					TokenID:      tokenID,
					CBDCType:     models.CBDCTypeUSD,
					Denomination: 100.0,
					CurrentOwner: currentOwner,
					Status:       models.TokenStatusFrozen,
					CreatedAt:    time.Now(),
					UpdatedAt:    time.Now(),
				}
				
				db.On("Transaction", mock.AnythingOfType("func(*sql.Tx) error")).Return(nil)
				repo.On("GetByIDWithTx", mock.Anything, mock.Anything, tokenID).Return(token, nil)
			},
			expectError: true,
			errorType:   errors.ErrTokenFrozen,
		},
		{
			name: "same owner transfer",
			request: TransferTokenRequest{
				TokenID:       tokenID,
				NewOwner:      currentOwner,
				TransactionID: transactionID,
			},
			setupMocks: func(repo *MockTokenRepository, db *MockDatabase) {
				token := &models.Token{
					TokenID:      tokenID,
					CBDCType:     models.CBDCTypeUSD,
					Denomination: 100.0,
					CurrentOwner: currentOwner,
					Status:       models.TokenStatusActive,
					CreatedAt:    time.Now(),
					UpdatedAt:    time.Now(),
				}
				
				db.On("Transaction", mock.AnythingOfType("func(*sql.Tx) error")).Return(nil)
				repo.On("GetByIDWithTx", mock.Anything, mock.Anything, tokenID).Return(token, nil)
			},
			expectError: true,
			errorType:   errors.ErrInvalidTokenState,
		},
		{
			name: "nil token ID",
			request: TransferTokenRequest{
				TokenID:       uuid.Nil,
				NewOwner:      newOwner,
				TransactionID: transactionID,
			},
			setupMocks:  func(repo *MockTokenRepository, db *MockDatabase) {},
			expectError: true,
			errorType:   errors.ErrInvalidTokenState,
		},
		{
			name: "nil new owner",
			request: TransferTokenRequest{
				TokenID:       tokenID,
				NewOwner:      uuid.Nil,
				TransactionID: transactionID,
			},
			setupMocks:  func(repo *MockTokenRepository, db *MockDatabase) {},
			expectError: true,
			errorType:   errors.ErrInvalidTokenState,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockRepo := new(MockTokenRepository)
			mockDB := new(MockDatabase)
			
			service := NewTokenServiceWithDeps(mockRepo, mockDB)

			tt.setupMocks(mockRepo, mockDB)

			response, err := service.TransferToken(context.Background(), tt.request)

			if tt.expectError {
				assert.Error(t, err)
				assert.Nil(t, response)
				
				if tt.errorType != "" {
					tokenErr, ok := err.(*errors.EchoPayError)
					assert.True(t, ok, "Expected EchoPayError")
					assert.Equal(t, tt.errorType, tokenErr.Code)
				}
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, response)
				assert.Equal(t, tt.request.NewOwner, response.Token.CurrentOwner)
				assert.Equal(t, currentOwner, response.PreviousOwner)
				assert.Contains(t, response.Token.TransactionHistory, tt.request.TransactionID)
			}

			mockRepo.AssertExpectations(t)
			mockDB.AssertExpectations(t)
		})
	}
}

func TestTokenService_DestroyToken(t *testing.T) {
	tokenID := uuid.New()
	owner := uuid.New()

	tests := []struct {
		name        string
		tokenID     uuid.UUID
		setupMocks  func(*MockTokenRepository, *MockDatabase)
		expectError bool
		errorType   string
	}{
		{
			name:    "successful token destruction",
			tokenID: tokenID,
			setupMocks: func(repo *MockTokenRepository, db *MockDatabase) {
				token := &models.Token{
					TokenID:      tokenID,
					CBDCType:     models.CBDCTypeUSD,
					Denomination: 100.0,
					CurrentOwner: owner,
					Status:       models.TokenStatusActive,
					CreatedAt:    time.Now(),
					UpdatedAt:    time.Now(),
				}
				
				db.On("Transaction", mock.AnythingOfType("func(*sql.Tx) error")).Return(nil)
				repo.On("GetByIDWithTx", mock.Anything, mock.Anything, tokenID).Return(token, nil)
				repo.On("UpdateWithTx", mock.Anything, mock.Anything, mock.AnythingOfType("*models.Token")).Return(nil)
			},
			expectError: false,
		},
		{
			name:    "token not found",
			tokenID: tokenID,
			setupMocks: func(repo *MockTokenRepository, db *MockDatabase) {
				db.On("Transaction", mock.AnythingOfType("func(*sql.Tx) error")).Return(nil)
				repo.On("GetByIDWithTx", mock.Anything, mock.Anything, tokenID).Return(nil, nil)
			},
			expectError: true,
			errorType:   errors.ErrTokenNotFound,
		},
		{
			name:    "already invalid token",
			tokenID: tokenID,
			setupMocks: func(repo *MockTokenRepository, db *MockDatabase) {
				token := &models.Token{
					TokenID:      tokenID,
					CBDCType:     models.CBDCTypeUSD,
					Denomination: 100.0,
					CurrentOwner: owner,
					Status:       models.TokenStatusInvalid,
					CreatedAt:    time.Now(),
					UpdatedAt:    time.Now(),
				}
				
				db.On("Transaction", mock.AnythingOfType("func(*sql.Tx) error")).Return(nil)
				repo.On("GetByIDWithTx", mock.Anything, mock.Anything, tokenID).Return(token, nil)
			},
			expectError: true,
			errorType:   errors.ErrInvalidTokenState,
		},
		{
			name:        "nil token ID",
			tokenID:     uuid.Nil,
			setupMocks:  func(repo *MockTokenRepository, db *MockDatabase) {},
			expectError: true,
			errorType:   errors.ErrInvalidTokenState,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockRepo := new(MockTokenRepository)
			mockDB := new(MockDatabase)
			
			service := NewTokenServiceWithDeps(mockRepo, mockDB)

			tt.setupMocks(mockRepo, mockDB)

			err := service.DestroyToken(context.Background(), tt.tokenID)

			if tt.expectError {
				assert.Error(t, err)
				
				if tt.errorType != "" {
					tokenErr, ok := err.(*errors.EchoPayError)
					assert.True(t, ok, "Expected EchoPayError")
					assert.Equal(t, tt.errorType, tokenErr.Code)
				}
			} else {
				assert.NoError(t, err)
			}

			mockRepo.AssertExpectations(t)
			mockDB.AssertExpectations(t)
		})
	}
}

func TestTokenService_GetToken(t *testing.T) {
	tokenID := uuid.New()
	owner := uuid.New()

	tests := []struct {
		name        string
		tokenID     uuid.UUID
		setupMocks  func(*MockTokenRepository)
		expectError bool
		errorType   string
	}{
		{
			name:    "successful token retrieval",
			tokenID: tokenID,
			setupMocks: func(repo *MockTokenRepository) {
				token := &models.Token{
					TokenID:      tokenID,
					CBDCType:     models.CBDCTypeUSD,
					Denomination: 100.0,
					CurrentOwner: owner,
					Status:       models.TokenStatusActive,
					CreatedAt:    time.Now(),
					UpdatedAt:    time.Now(),
				}
				
				repo.On("GetByID", mock.Anything, tokenID).Return(token, nil)
			},
			expectError: false,
		},
		{
			name:    "token not found",
			tokenID: tokenID,
			setupMocks: func(repo *MockTokenRepository) {
				repo.On("GetByID", mock.Anything, tokenID).Return(nil, nil)
			},
			expectError: true,
			errorType:   errors.ErrTokenNotFound,
		},
		{
			name:        "nil token ID",
			tokenID:     uuid.Nil,
			setupMocks:  func(repo *MockTokenRepository) {},
			expectError: true,
			errorType:   errors.ErrInvalidTokenState,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockRepo := new(MockTokenRepository)
			
			service := NewTokenServiceWithDeps(mockRepo, nil)

			tt.setupMocks(mockRepo)

			token, err := service.GetToken(context.Background(), tt.tokenID)

			if tt.expectError {
				assert.Error(t, err)
				assert.Nil(t, token)
				
				if tt.errorType != "" {
					tokenErr, ok := err.(*errors.EchoPayError)
					assert.True(t, ok, "Expected EchoPayError")
					assert.Equal(t, tt.errorType, tokenErr.Code)
				}
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, token)
				assert.Equal(t, tt.tokenID, token.TokenID)
			}

			mockRepo.AssertExpectations(t)
		})
	}
}

func TestTokenService_VerifyOwnership(t *testing.T) {
	tokenID := uuid.New()
	owner := uuid.New()
	nonOwner := uuid.New()

	tests := []struct {
		name        string
		tokenID     uuid.UUID
		ownerID     uuid.UUID
		setupMocks  func(*MockTokenRepository)
		expectOwner bool
		expectError bool
	}{
		{
			name:    "valid ownership",
			tokenID: tokenID,
			ownerID: owner,
			setupMocks: func(repo *MockTokenRepository) {
				token := &models.Token{
					TokenID:      tokenID,
					CurrentOwner: owner,
					Status:       models.TokenStatusActive,
				}
				repo.On("GetByID", mock.Anything, tokenID).Return(token, nil)
			},
			expectOwner: true,
			expectError: false,
		},
		{
			name:    "invalid ownership",
			tokenID: tokenID,
			ownerID: nonOwner,
			setupMocks: func(repo *MockTokenRepository) {
				token := &models.Token{
					TokenID:      tokenID,
					CurrentOwner: owner,
					Status:       models.TokenStatusActive,
				}
				repo.On("GetByID", mock.Anything, tokenID).Return(token, nil)
			},
			expectOwner: false,
			expectError: false,
		},
		{
			name:    "token not found",
			tokenID: tokenID,
			ownerID: owner,
			setupMocks: func(repo *MockTokenRepository) {
				repo.On("GetByID", mock.Anything, tokenID).Return(nil, nil)
			},
			expectOwner: false,
			expectError: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockRepo := new(MockTokenRepository)
			
			service := NewTokenServiceWithDeps(mockRepo, nil)

			tt.setupMocks(mockRepo)

			isOwner, err := service.VerifyOwnership(context.Background(), tt.tokenID, tt.ownerID)

			if tt.expectError {
				assert.Error(t, err)
			} else {
				assert.NoError(t, err)
				assert.Equal(t, tt.expectOwner, isOwner)
			}

			mockRepo.AssertExpectations(t)
		})
	}
}

func TestTokenService_FreezeToken(t *testing.T) {
	tokenID := uuid.New()
	owner := uuid.New()

	tests := []struct {
		name        string
		request     FreezeTokenRequest
		setupMocks  func(*MockTokenRepository, *MockDatabase)
		expectError bool
		errorType   string
	}{
		{
			name: "successful token freeze",
			request: FreezeTokenRequest{
				TokenID: tokenID,
				Reason:  "Fraud investigation",
			},
			setupMocks: func(repo *MockTokenRepository, db *MockDatabase) {
				token := &models.Token{
					TokenID:      tokenID,
					CBDCType:     models.CBDCTypeUSD,
					Denomination: 100.0,
					CurrentOwner: owner,
					Status:       models.TokenStatusActive,
					CreatedAt:    time.Now(),
					UpdatedAt:    time.Now(),
				}
				
				db.On("Transaction", mock.AnythingOfType("func(*sql.Tx) error")).Return(nil)
				repo.On("GetByIDWithTx", mock.Anything, mock.Anything, tokenID).Return(token, nil)
				repo.On("UpdateWithTx", mock.Anything, mock.Anything, mock.AnythingOfType("*models.Token")).Return(nil)
			},
			expectError: false,
		},
		{
			name: "freeze already frozen token",
			request: FreezeTokenRequest{
				TokenID: tokenID,
				Reason:  "Additional investigation",
			},
			setupMocks: func(repo *MockTokenRepository, db *MockDatabase) {
				token := &models.Token{
					TokenID:      tokenID,
					CBDCType:     models.CBDCTypeUSD,
					Denomination: 100.0,
					CurrentOwner: owner,
					Status:       models.TokenStatusFrozen,
					CreatedAt:    time.Now(),
					UpdatedAt:    time.Now(),
				}
				
				db.On("Transaction", mock.AnythingOfType("func(*sql.Tx) error")).Return(nil)
				repo.On("GetByIDWithTx", mock.Anything, mock.Anything, tokenID).Return(token, nil)
			},
			expectError: true,
			errorType:   errors.ErrInvalidTokenState,
		},
		{
			name: "freeze invalid token",
			request: FreezeTokenRequest{
				TokenID: tokenID,
				Reason:  "Investigation",
			},
			setupMocks: func(repo *MockTokenRepository, db *MockDatabase) {
				token := &models.Token{
					TokenID:      tokenID,
					CBDCType:     models.CBDCTypeUSD,
					Denomination: 100.0,
					CurrentOwner: owner,
					Status:       models.TokenStatusInvalid,
					CreatedAt:    time.Now(),
					UpdatedAt:    time.Now(),
				}
				
				db.On("Transaction", mock.AnythingOfType("func(*sql.Tx) error")).Return(nil)
				repo.On("GetByIDWithTx", mock.Anything, mock.Anything, tokenID).Return(token, nil)
			},
			expectError: true,
			errorType:   errors.ErrInvalidTokenState,
		},
		{
			name: "token not found",
			request: FreezeTokenRequest{
				TokenID: tokenID,
				Reason:  "Investigation",
			},
			setupMocks: func(repo *MockTokenRepository, db *MockDatabase) {
				db.On("Transaction", mock.AnythingOfType("func(*sql.Tx) error")).Return(nil)
				repo.On("GetByIDWithTx", mock.Anything, mock.Anything, tokenID).Return(nil, nil)
			},
			expectError: true,
			errorType:   errors.ErrTokenNotFound,
		},
		{
			name: "nil token ID",
			request: FreezeTokenRequest{
				TokenID: uuid.Nil,
				Reason:  "Investigation",
			},
			setupMocks:  func(repo *MockTokenRepository, db *MockDatabase) {},
			expectError: true,
			errorType:   errors.ErrInvalidTokenState,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockRepo := new(MockTokenRepository)
			mockDB := new(MockDatabase)
			
			service := NewTokenServiceWithDeps(mockRepo, mockDB)

			tt.setupMocks(mockRepo, mockDB)

			response, err := service.FreezeToken(context.Background(), tt.request)

			if tt.expectError {
				assert.Error(t, err)
				assert.Nil(t, response)
				
				if tt.errorType != "" {
					tokenErr, ok := err.(*errors.EchoPayError)
					assert.True(t, ok, "Expected EchoPayError")
					assert.Equal(t, tt.errorType, tokenErr.Code)
				}
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, response)
				assert.Equal(t, models.TokenStatusFrozen, response.Token.Status)
				assert.Equal(t, tt.request.Reason, response.Reason)
				assert.WithinDuration(t, time.Now(), response.FrozenAt, time.Second)
			}

			mockRepo.AssertExpectations(t)
			mockDB.AssertExpectations(t)
		})
	}
}

func TestTokenService_UnfreezeToken(t *testing.T) {
	tokenID := uuid.New()
	owner := uuid.New()

	tests := []struct {
		name        string
		request     UnfreezeTokenRequest
		setupMocks  func(*MockTokenRepository, *MockDatabase)
		expectError bool
		errorType   string
	}{
		{
			name: "successful token unfreeze",
			request: UnfreezeTokenRequest{
				TokenID: tokenID,
				Reason:  "Investigation completed",
			},
			setupMocks: func(repo *MockTokenRepository, db *MockDatabase) {
				token := &models.Token{
					TokenID:      tokenID,
					CBDCType:     models.CBDCTypeUSD,
					Denomination: 100.0,
					CurrentOwner: owner,
					Status:       models.TokenStatusFrozen,
					CreatedAt:    time.Now(),
					UpdatedAt:    time.Now(),
				}
				
				db.On("Transaction", mock.AnythingOfType("func(*sql.Tx) error")).Return(nil)
				repo.On("GetByIDWithTx", mock.Anything, mock.Anything, tokenID).Return(token, nil)
				repo.On("UpdateWithTx", mock.Anything, mock.Anything, mock.AnythingOfType("*models.Token")).Return(nil)
			},
			expectError: false,
		},
		{
			name: "unfreeze active token",
			request: UnfreezeTokenRequest{
				TokenID: tokenID,
				Reason:  "Not needed",
			},
			setupMocks: func(repo *MockTokenRepository, db *MockDatabase) {
				token := &models.Token{
					TokenID:      tokenID,
					CBDCType:     models.CBDCTypeUSD,
					Denomination: 100.0,
					CurrentOwner: owner,
					Status:       models.TokenStatusActive,
					CreatedAt:    time.Now(),
					UpdatedAt:    time.Now(),
				}
				
				db.On("Transaction", mock.AnythingOfType("func(*sql.Tx) error")).Return(nil)
				repo.On("GetByIDWithTx", mock.Anything, mock.Anything, tokenID).Return(token, nil)
			},
			expectError: true,
			errorType:   errors.ErrInvalidTokenState,
		},
		{
			name: "token not found",
			request: UnfreezeTokenRequest{
				TokenID: tokenID,
				Reason:  "Investigation completed",
			},
			setupMocks: func(repo *MockTokenRepository, db *MockDatabase) {
				db.On("Transaction", mock.AnythingOfType("func(*sql.Tx) error")).Return(nil)
				repo.On("GetByIDWithTx", mock.Anything, mock.Anything, tokenID).Return(nil, nil)
			},
			expectError: true,
			errorType:   errors.ErrTokenNotFound,
		},
		{
			name: "nil token ID",
			request: UnfreezeTokenRequest{
				TokenID: uuid.Nil,
				Reason:  "Investigation completed",
			},
			setupMocks:  func(repo *MockTokenRepository, db *MockDatabase) {},
			expectError: true,
			errorType:   errors.ErrInvalidTokenState,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockRepo := new(MockTokenRepository)
			mockDB := new(MockDatabase)
			
			service := NewTokenServiceWithDeps(mockRepo, mockDB)

			tt.setupMocks(mockRepo, mockDB)

			response, err := service.UnfreezeToken(context.Background(), tt.request)

			if tt.expectError {
				assert.Error(t, err)
				assert.Nil(t, response)
				
				if tt.errorType != "" {
					tokenErr, ok := err.(*errors.EchoPayError)
					assert.True(t, ok, "Expected EchoPayError")
					assert.Equal(t, tt.errorType, tokenErr.Code)
				}
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, response)
				assert.Equal(t, models.TokenStatusActive, response.Token.Status)
				assert.Equal(t, tt.request.Reason, response.Reason)
				assert.WithinDuration(t, time.Now(), response.UnfrozenAt, time.Second)
			}

			mockRepo.AssertExpectations(t)
			mockDB.AssertExpectations(t)
		})
	}
}

func TestTokenService_BulkUpdateTokenStatus(t *testing.T) {
	tokenID1 := uuid.New()
	tokenID2 := uuid.New()
	tokenID3 := uuid.New()

	tests := []struct {
		name        string
		request     BulkStatusUpdateRequest
		setupMocks  func(*MockTokenRepository)
		expectError bool
		errorType   string
	}{
		{
			name: "successful bulk freeze",
			request: BulkStatusUpdateRequest{
				TokenIDs:  []uuid.UUID{tokenID1, tokenID2, tokenID3},
				NewStatus: models.TokenStatusFrozen,
				Reason:    "Fraud investigation",
			},
			setupMocks: func(repo *MockTokenRepository) {
				repo.On("BulkUpdateStatus", mock.Anything, []uuid.UUID{tokenID1, tokenID2, tokenID3}, models.TokenStatusFrozen).Return(nil)
			},
			expectError: false,
		},
		{
			name: "successful bulk unfreeze",
			request: BulkStatusUpdateRequest{
				TokenIDs:  []uuid.UUID{tokenID1, tokenID2},
				NewStatus: models.TokenStatusActive,
				Reason:    "Investigation completed",
			},
			setupMocks: func(repo *MockTokenRepository) {
				repo.On("BulkUpdateStatus", mock.Anything, []uuid.UUID{tokenID1, tokenID2}, models.TokenStatusActive).Return(nil)
			},
			expectError: false,
		},
		{
			name: "empty token list",
			request: BulkStatusUpdateRequest{
				TokenIDs:  []uuid.UUID{},
				NewStatus: models.TokenStatusFrozen,
				Reason:    "Investigation",
			},
			setupMocks:  func(repo *MockTokenRepository) {},
			expectError: true,
			errorType:   errors.ErrInvalidTokenState,
		},
		{
			name: "too many tokens",
			request: BulkStatusUpdateRequest{
				TokenIDs:  make([]uuid.UUID, 1001),
				NewStatus: models.TokenStatusFrozen,
				Reason:    "Investigation",
			},
			setupMocks:  func(repo *MockTokenRepository) {},
			expectError: true,
			errorType:   errors.ErrInvalidTokenState,
		},
		{
			name: "invalid status",
			request: BulkStatusUpdateRequest{
				TokenIDs:  []uuid.UUID{tokenID1},
				NewStatus: "invalid-status",
				Reason:    "Investigation",
			},
			setupMocks:  func(repo *MockTokenRepository) {},
			expectError: true,
			errorType:   errors.ErrInvalidTokenState,
		},
		{
			name: "nil token ID",
			request: BulkStatusUpdateRequest{
				TokenIDs:  []uuid.UUID{tokenID1, uuid.Nil, tokenID2},
				NewStatus: models.TokenStatusFrozen,
				Reason:    "Investigation",
			},
			setupMocks:  func(repo *MockTokenRepository) {},
			expectError: true,
			errorType:   errors.ErrInvalidTokenState,
		},
		{
			name: "duplicate token ID",
			request: BulkStatusUpdateRequest{
				TokenIDs:  []uuid.UUID{tokenID1, tokenID2, tokenID1},
				NewStatus: models.TokenStatusFrozen,
				Reason:    "Investigation",
			},
			setupMocks:  func(repo *MockTokenRepository) {},
			expectError: true,
			errorType:   errors.ErrInvalidTokenState,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockRepo := new(MockTokenRepository)
			
			service := NewTokenServiceWithDeps(mockRepo, nil)

			tt.setupMocks(mockRepo)

			response, err := service.BulkUpdateTokenStatus(context.Background(), tt.request)

			if tt.expectError {
				assert.Error(t, err)
				assert.Nil(t, response)
				
				if tt.errorType != "" {
					tokenErr, ok := err.(*errors.EchoPayError)
					assert.True(t, ok, "Expected EchoPayError")
					assert.Equal(t, tt.errorType, tokenErr.Code)
				}
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, response)
				assert.Equal(t, len(tt.request.TokenIDs), response.UpdatedCount)
				assert.Equal(t, tt.request.NewStatus, response.NewStatus)
				assert.Equal(t, tt.request.Reason, response.Reason)
				assert.WithinDuration(t, time.Now(), response.UpdatedAt, time.Second)
			}

			mockRepo.AssertExpectations(t)
		})
	}
}

func TestTokenService_BulkFreezeTokens(t *testing.T) {
	tokenID1 := uuid.New()
	tokenID2 := uuid.New()
	tokenID3 := uuid.New()

	tests := []struct {
		name        string
		tokenIDs    []uuid.UUID
		reason      string
		setupMocks  func(*MockTokenRepository)
		expectError bool
		errorType   string
	}{
		{
			name:     "successful bulk freeze",
			tokenIDs: []uuid.UUID{tokenID1, tokenID2, tokenID3},
			reason:   "Fraud investigation",
			setupMocks: func(repo *MockTokenRepository) {
				repo.On("BulkUpdateStatus", mock.Anything, []uuid.UUID{tokenID1, tokenID2, tokenID3}, models.TokenStatusFrozen).Return(nil)
			},
			expectError: false,
		},
		{
			name:        "empty token list",
			tokenIDs:    []uuid.UUID{},
			reason:      "Investigation",
			setupMocks:  func(repo *MockTokenRepository) {},
			expectError: true,
			errorType:   errors.ErrInvalidTokenState,
		},
		{
			name:        "too many tokens",
			tokenIDs:    make([]uuid.UUID, 1001),
			reason:      "Investigation",
			setupMocks:  func(repo *MockTokenRepository) {},
			expectError: true,
			errorType:   errors.ErrInvalidTokenState,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockRepo := new(MockTokenRepository)
			
			service := NewTokenServiceWithDeps(mockRepo, nil)

			tt.setupMocks(mockRepo)

			response, err := service.BulkFreezeTokens(context.Background(), tt.tokenIDs, tt.reason)

			if tt.expectError {
				assert.Error(t, err)
				assert.Nil(t, response)
				
				if tt.errorType != "" {
					tokenErr, ok := err.(*errors.EchoPayError)
					assert.True(t, ok, "Expected EchoPayError")
					assert.Equal(t, tt.errorType, tokenErr.Code)
				}
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, response)
				assert.Equal(t, len(tt.tokenIDs), response.UpdatedCount)
				assert.Equal(t, models.TokenStatusFrozen, response.NewStatus)
				assert.Equal(t, tt.reason, response.Reason)
			}

			mockRepo.AssertExpectations(t)
		})
	}
}

func TestTokenService_BulkUnfreezeTokens(t *testing.T) {
	tokenID1 := uuid.New()
	tokenID2 := uuid.New()

	tests := []struct {
		name        string
		tokenIDs    []uuid.UUID
		reason      string
		setupMocks  func(*MockTokenRepository)
		expectError bool
		errorType   string
	}{
		{
			name:     "successful bulk unfreeze",
			tokenIDs: []uuid.UUID{tokenID1, tokenID2},
			reason:   "Investigation completed",
			setupMocks: func(repo *MockTokenRepository) {
				repo.On("BulkUpdateStatus", mock.Anything, []uuid.UUID{tokenID1, tokenID2}, models.TokenStatusActive).Return(nil)
			},
			expectError: false,
		},
		{
			name:        "empty token list",
			tokenIDs:    []uuid.UUID{},
			reason:      "Investigation completed",
			setupMocks:  func(repo *MockTokenRepository) {},
			expectError: true,
			errorType:   errors.ErrInvalidTokenState,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockRepo := new(MockTokenRepository)
			
			service := NewTokenServiceWithDeps(mockRepo, nil)

			tt.setupMocks(mockRepo)

			response, err := service.BulkUnfreezeTokens(context.Background(), tt.tokenIDs, tt.reason)

			if tt.expectError {
				assert.Error(t, err)
				assert.Nil(t, response)
				
				if tt.errorType != "" {
					tokenErr, ok := err.(*errors.EchoPayError)
					assert.True(t, ok, "Expected EchoPayError")
					assert.Equal(t, tt.errorType, tokenErr.Code)
				}
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, response)
				assert.Equal(t, len(tt.tokenIDs), response.UpdatedCount)
				assert.Equal(t, models.TokenStatusActive, response.NewStatus)
				assert.Equal(t, tt.reason, response.Reason)
			}

			mockRepo.AssertExpectations(t)
		})
	}
}

func TestTokenService_GetTokensByStatus(t *testing.T) {
	tokenID1 := uuid.New()
	tokenID2 := uuid.New()
	owner := uuid.New()

	tests := []struct {
		name        string
		status      models.TokenStatus
		setupMocks  func(*MockTokenRepository)
		expectError bool
		errorType   string
	}{
		{
			name:   "successful retrieval of frozen tokens",
			status: models.TokenStatusFrozen,
			setupMocks: func(repo *MockTokenRepository) {
				tokens := []models.Token{
					{
						TokenID:      tokenID1,
						CurrentOwner: owner,
						Status:       models.TokenStatusFrozen,
					},
					{
						TokenID:      tokenID2,
						CurrentOwner: owner,
						Status:       models.TokenStatusFrozen,
					},
				}
				repo.On("GetByStatus", mock.Anything, models.TokenStatusFrozen).Return(tokens, nil)
			},
			expectError: false,
		},
		{
			name:        "invalid status",
			status:      "invalid-status",
			setupMocks:  func(repo *MockTokenRepository) {},
			expectError: true,
			errorType:   errors.ErrInvalidTokenState,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockRepo := new(MockTokenRepository)
			
			service := NewTokenServiceWithDeps(mockRepo, nil)

			tt.setupMocks(mockRepo)

			tokens, err := service.GetTokensByStatus(context.Background(), tt.status)

			if tt.expectError {
				assert.Error(t, err)
				assert.Nil(t, tokens)
				
				if tt.errorType != "" {
					tokenErr, ok := err.(*errors.EchoPayError)
					assert.True(t, ok, "Expected EchoPayError")
					assert.Equal(t, tt.errorType, tokenErr.Code)
				}
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, tokens)
				
				// Verify all tokens have the expected status
				for _, token := range tokens {
					assert.Equal(t, tt.status, token.Status)
				}
			}

			mockRepo.AssertExpectations(t)
		})
	}
}

func TestTokenService_GetTokenAuditTrail(t *testing.T) {
	tokenID := uuid.New()

	tests := []struct {
		name        string
		tokenID     uuid.UUID
		setupMocks  func(*MockTokenRepository)
		expectError bool
		errorType   string
	}{
		{
			name:    "successful audit trail retrieval",
			tokenID: tokenID,
			setupMocks: func(repo *MockTokenRepository) {
				auditEntries := []repository.TokenAuditEntry{
					{
						ID:        uuid.New(),
						TokenID:   tokenID,
						Operation: "CREATE",
						NewStatus: models.TokenStatusActive,
					},
					{
						ID:        uuid.New(),
						TokenID:   tokenID,
						Operation: "STATUS_CHANGE",
						OldStatus: models.TokenStatusActive,
						NewStatus: models.TokenStatusFrozen,
					},
				}
				repo.On("GetAuditTrail", mock.Anything, tokenID).Return(auditEntries, nil)
			},
			expectError: false,
		},
		{
			name:        "nil token ID",
			tokenID:     uuid.Nil,
			setupMocks:  func(repo *MockTokenRepository) {},
			expectError: true,
			errorType:   errors.ErrInvalidTokenState,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockRepo := new(MockTokenRepository)
			
			service := NewTokenServiceWithDeps(mockRepo, nil)

			tt.setupMocks(mockRepo)

			auditTrail, err := service.GetTokenAuditTrail(context.Background(), tt.tokenID)

			if tt.expectError {
				assert.Error(t, err)
				assert.Nil(t, auditTrail)
				
				if tt.errorType != "" {
					tokenErr, ok := err.(*errors.EchoPayError)
					assert.True(t, ok, "Expected EchoPayError")
					assert.Equal(t, tt.errorType, tokenErr.Code)
				}
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, auditTrail)
				
				// Verify all audit entries are for the correct token
				for _, entry := range auditTrail {
					assert.Equal(t, tt.tokenID, entry.TokenID)
				}
			}

			mockRepo.AssertExpectations(t)
		})
	}
}

// Concurrent access tests for token state transitions
func TestTokenService_ConcurrentTokenStateTransitions(t *testing.T) {
	tokenID := uuid.New()
	owner := uuid.New()

	tests := []struct {
		name        string
		setupMocks  func(*MockTokenRepository, *MockDatabase)
		operations  []func(*TokenService) error
		expectError bool
	}{
		{
			name: "concurrent freeze operations",
			setupMocks: func(repo *MockTokenRepository, db *MockDatabase) {
				token := &models.Token{
					TokenID:      tokenID,
					CBDCType:     models.CBDCTypeUSD,
					Denomination: 100.0,
					CurrentOwner: owner,
					Status:       models.TokenStatusActive,
					CreatedAt:    time.Now(),
					UpdatedAt:    time.Now(),
				}
				
				// First operation succeeds
				db.On("Transaction", mock.AnythingOfType("func(*sql.Tx) error")).Return(nil).Once()
				repo.On("GetByIDWithTx", mock.Anything, mock.Anything, tokenID).Return(token, nil).Once()
				repo.On("UpdateWithTx", mock.Anything, mock.Anything, mock.AnythingOfType("*models.Token")).Return(nil).Once()
				
				// Second operation finds already frozen token
				frozenToken := &models.Token{
					TokenID:      tokenID,
					CBDCType:     models.CBDCTypeUSD,
					Denomination: 100.0,
					CurrentOwner: owner,
					Status:       models.TokenStatusFrozen,
					CreatedAt:    time.Now(),
					UpdatedAt:    time.Now(),
				}
				db.On("Transaction", mock.AnythingOfType("func(*sql.Tx) error")).Return(nil).Once()
				repo.On("GetByIDWithTx", mock.Anything, mock.Anything, tokenID).Return(frozenToken, nil).Once()
			},
			operations: []func(*TokenService) error{
				func(s *TokenService) error {
					_, err := s.FreezeToken(context.Background(), FreezeTokenRequest{
						TokenID: tokenID,
						Reason:  "First freeze",
					})
					return err
				},
				func(s *TokenService) error {
					_, err := s.FreezeToken(context.Background(), FreezeTokenRequest{
						TokenID: tokenID,
						Reason:  "Second freeze",
					})
					return err
				},
			},
			expectError: true, // Second operation should fail
		},
		{
			name: "concurrent freeze and unfreeze operations",
			setupMocks: func(repo *MockTokenRepository, db *MockDatabase) {
				activeToken := &models.Token{
					TokenID:      tokenID,
					CBDCType:     models.CBDCTypeUSD,
					Denomination: 100.0,
					CurrentOwner: owner,
					Status:       models.TokenStatusActive,
					CreatedAt:    time.Now(),
					UpdatedAt:    time.Now(),
				}
				
				frozenToken := &models.Token{
					TokenID:      tokenID,
					CBDCType:     models.CBDCTypeUSD,
					Denomination: 100.0,
					CurrentOwner: owner,
					Status:       models.TokenStatusFrozen,
					CreatedAt:    time.Now(),
					UpdatedAt:    time.Now(),
				}
				
				// Freeze operation
				db.On("Transaction", mock.AnythingOfType("func(*sql.Tx) error")).Return(nil).Once()
				repo.On("GetByIDWithTx", mock.Anything, mock.Anything, tokenID).Return(activeToken, nil).Once()
				repo.On("UpdateWithTx", mock.Anything, mock.Anything, mock.AnythingOfType("*models.Token")).Return(nil).Once()
				
				// Unfreeze operation
				db.On("Transaction", mock.AnythingOfType("func(*sql.Tx) error")).Return(nil).Once()
				repo.On("GetByIDWithTx", mock.Anything, mock.Anything, tokenID).Return(frozenToken, nil).Once()
				repo.On("UpdateWithTx", mock.Anything, mock.Anything, mock.AnythingOfType("*models.Token")).Return(nil).Once()
			},
			operations: []func(*TokenService) error{
				func(s *TokenService) error {
					_, err := s.FreezeToken(context.Background(), FreezeTokenRequest{
						TokenID: tokenID,
						Reason:  "Freeze operation",
					})
					return err
				},
				func(s *TokenService) error {
					_, err := s.UnfreezeToken(context.Background(), UnfreezeTokenRequest{
						TokenID: tokenID,
						Reason:  "Unfreeze operation",
					})
					return err
				},
			},
			expectError: false, // Both operations should succeed
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockRepo := new(MockTokenRepository)
			mockDB := new(MockDatabase)
			
			service := NewTokenServiceWithDeps(mockRepo, mockDB)

			tt.setupMocks(mockRepo, mockDB)

			// Execute operations sequentially (simulating concurrent access)
			var errors []error
			for _, op := range tt.operations {
				err := op(service)
				if err != nil {
					errors = append(errors, err)
				}
			}

			if tt.expectError {
				assert.NotEmpty(t, errors, "Expected at least one operation to fail")
			} else {
				assert.Empty(t, errors, "Expected all operations to succeed")
			}

			mockRepo.AssertExpectations(t)
			mockDB.AssertExpectations(t)
		})
	}
}

// Test for bulk operations with mixed token states
func TestTokenService_BulkOperationsWithMixedStates(t *testing.T) {
	tokenID1 := uuid.New()
	tokenID2 := uuid.New()
	tokenID3 := uuid.New()

	tests := []struct {
		name        string
		request     BulkStatusUpdateRequest
		setupMocks  func(*MockTokenRepository)
		expectError bool
		errorType   string
	}{
		{
			name: "bulk freeze with mixed initial states",
			request: BulkStatusUpdateRequest{
				TokenIDs:  []uuid.UUID{tokenID1, tokenID2, tokenID3},
				NewStatus: models.TokenStatusFrozen,
				Reason:    "Emergency freeze",
			},
			setupMocks: func(repo *MockTokenRepository) {
				// Repository should handle the bulk update regardless of initial states
				repo.On("BulkUpdateStatus", mock.Anything, []uuid.UUID{tokenID1, tokenID2, tokenID3}, models.TokenStatusFrozen).Return(nil)
			},
			expectError: false,
		},
		{
			name: "bulk invalidate tokens",
			request: BulkStatusUpdateRequest{
				TokenIDs:  []uuid.UUID{tokenID1, tokenID2},
				NewStatus: models.TokenStatusInvalid,
				Reason:    "Security breach",
			},
			setupMocks: func(repo *MockTokenRepository) {
				repo.On("BulkUpdateStatus", mock.Anything, []uuid.UUID{tokenID1, tokenID2}, models.TokenStatusInvalid).Return(nil)
			},
			expectError: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mockRepo := new(MockTokenRepository)
			
			service := NewTokenServiceWithDeps(mockRepo, nil)

			tt.setupMocks(mockRepo)

			response, err := service.BulkUpdateTokenStatus(context.Background(), tt.request)

			if tt.expectError {
				assert.Error(t, err)
				assert.Nil(t, response)
				
				if tt.errorType != "" {
					tokenErr, ok := err.(*errors.EchoPayError)
					assert.True(t, ok, "Expected EchoPayError")
					assert.Equal(t, tt.errorType, tokenErr.Code)
				}
			} else {
				assert.NoError(t, err)
				assert.NotNil(t, response)
				assert.Equal(t, len(tt.request.TokenIDs), response.UpdatedCount)
				assert.Equal(t, tt.request.NewStatus, response.NewStatus)
			}

			mockRepo.AssertExpectations(t)
		})
	}
}

// Test for timestamp logging verification
func TestTokenService_TimestampLogging(t *testing.T) {
	tokenID := uuid.New()
	owner := uuid.New()

	t.Run("freeze operation updates timestamp", func(t *testing.T) {
		mockRepo := new(MockTokenRepository)
		mockDB := new(MockDatabase)
		
		service := NewTokenServiceWithDeps(mockRepo, mockDB)

		token := &models.Token{
			TokenID:      tokenID,
			CBDCType:     models.CBDCTypeUSD,
			Denomination: 100.0,
			CurrentOwner: owner,
			Status:       models.TokenStatusActive,
			CreatedAt:    time.Now().Add(-time.Hour),
			UpdatedAt:    time.Now().Add(-time.Hour),
		}
		
		mockDB.On("Transaction", mock.AnythingOfType("func(*sql.Tx) error")).Return(nil)
		mockRepo.On("GetByIDWithTx", mock.Anything, mock.Anything, tokenID).Return(token, nil)
		mockRepo.On("UpdateWithTx", mock.Anything, mock.Anything, mock.AnythingOfType("*models.Token")).Return(nil)

		response, err := service.FreezeToken(context.Background(), FreezeTokenRequest{
			TokenID: tokenID,
			Reason:  "Test freeze",
		})

		assert.NoError(t, err)
		assert.NotNil(t, response)
		assert.WithinDuration(t, time.Now(), response.FrozenAt, time.Second)

		mockRepo.AssertExpectations(t)
		mockDB.AssertExpectations(t)
	})
}