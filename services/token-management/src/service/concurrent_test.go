package service

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	
	"echopay/token-management/src/models"
)

// TestConcurrentBulkOperations tests concurrent bulk operations
func TestConcurrentBulkOperations(t *testing.T) {
	t.Run("concurrent bulk freeze operations", func(t *testing.T) {
		mockRepo := new(MockTokenRepository)
		
		service := NewTokenServiceWithDeps(mockRepo, nil)

		concurrency := 3

		// Each bulk operation will call BulkUpdateStatus
		mockRepo.On("BulkUpdateStatus", mock.Anything, mock.AnythingOfType("[]uuid.UUID"), models.TokenStatusFrozen).Return(nil).Times(concurrency)

		// Run concurrent bulk operations
		var wg sync.WaitGroup
		errors := make(chan error, concurrency)

		for i := 0; i < concurrency; i++ {
			wg.Add(1)
			go func(index int) {
				defer wg.Done()
				// Use different token sets for each operation
				uniqueTokenIDs := []uuid.UUID{uuid.New(), uuid.New()}
				_, err := service.BulkFreezeTokens(context.Background(), uniqueTokenIDs, "Concurrent bulk test")
				errors <- err
			}(i)
		}

		wg.Wait()
		close(errors)

		// Check results - all operations should succeed
		var errorCount int
		for err := range errors {
			if err != nil {
				errorCount++
				t.Logf("Operation error: %v", err)
			}
		}

		assert.Equal(t, 0, errorCount, "All concurrent bulk operations should succeed")
		mockRepo.AssertExpectations(t)
	})
}

// TestTokenStateTransitionValidation tests that state transitions are properly validated
func TestTokenStateTransitionValidation(t *testing.T) {
	t.Run("prevent invalid state transitions", func(t *testing.T) {
		mockRepo := new(MockTokenRepository)
		mockDB := new(MockDatabase)
		
		service := NewTokenServiceWithDeps(mockRepo, mockDB)

		tokenID := uuid.New()
		owner := uuid.New()

		// Try to unfreeze an already active token
		activeToken := &models.Token{
			TokenID:      tokenID,
			CBDCType:     models.CBDCTypeUSD,
			Denomination: 100.0,
			CurrentOwner: owner,
			Status:       models.TokenStatusActive,
			CreatedAt:    time.Now(),
			UpdatedAt:    time.Now(),
		}

		mockDB.On("Transaction", mock.AnythingOfType("func(*sql.Tx) error")).Return(nil)
		mockRepo.On("GetByIDWithTx", mock.Anything, mock.Anything, tokenID).Return(activeToken, nil)

		_, err := service.UnfreezeToken(context.Background(), UnfreezeTokenRequest{
			TokenID: tokenID,
			Reason:  "Invalid state transition test",
		})

		assert.Error(t, err, "Should not be able to unfreeze an active token")

		mockRepo.AssertExpectations(t)
		mockDB.AssertExpectations(t)
	})
}

// TestBulkOperationAtomicity tests that bulk operations are atomic
func TestBulkOperationAtomicity(t *testing.T) {
	tokenIDs := []uuid.UUID{uuid.New(), uuid.New(), uuid.New()}

	t.Run("bulk freeze atomicity", func(t *testing.T) {
		mockRepo := new(MockTokenRepository)
		
		service := NewTokenServiceWithDeps(mockRepo, nil)

		// Mock successful bulk update
		mockRepo.On("BulkUpdateStatus", mock.Anything, tokenIDs, models.TokenStatusFrozen).Return(nil)

		response, err := service.BulkFreezeTokens(context.Background(), tokenIDs, "Atomicity test")

		assert.NoError(t, err)
		assert.NotNil(t, response)
		assert.Equal(t, len(tokenIDs), response.UpdatedCount)
		assert.Equal(t, models.TokenStatusFrozen, response.NewStatus)

		mockRepo.AssertExpectations(t)
	})

	t.Run("bulk unfreeze atomicity", func(t *testing.T) {
		mockRepo := new(MockTokenRepository)
		
		service := NewTokenServiceWithDeps(mockRepo, nil)

		// Mock successful bulk update
		mockRepo.On("BulkUpdateStatus", mock.Anything, tokenIDs, models.TokenStatusActive).Return(nil)

		response, err := service.BulkUnfreezeTokens(context.Background(), tokenIDs, "Atomicity test")

		assert.NoError(t, err)
		assert.NotNil(t, response)
		assert.Equal(t, len(tokenIDs), response.UpdatedCount)
		assert.Equal(t, models.TokenStatusActive, response.NewStatus)

		mockRepo.AssertExpectations(t)
	})
}

// TestTimestampConsistency tests that timestamps are properly updated during state transitions
func TestTimestampConsistency(t *testing.T) {
	tokenID := uuid.New()
	owner := uuid.New()

	t.Run("timestamp updates during state transitions", func(t *testing.T) {
		mockRepo := new(MockTokenRepository)
		mockDB := new(MockDatabase)
		
		service := NewTokenServiceWithDeps(mockRepo, mockDB)

		originalTime := time.Now().Add(-time.Hour)
		token := &models.Token{
			TokenID:      tokenID,
			CBDCType:     models.CBDCTypeUSD,
			Denomination: 100.0,
			CurrentOwner: owner,
			Status:       models.TokenStatusActive,
			CreatedAt:    originalTime,
			UpdatedAt:    originalTime,
		}

		mockDB.On("Transaction", mock.AnythingOfType("func(*sql.Tx) error")).Return(nil)
		mockRepo.On("GetByIDWithTx", mock.Anything, mock.Anything, tokenID).Return(token, nil)
		
		// Verify that the updated token has a newer timestamp
		mockRepo.On("UpdateWithTx", mock.Anything, mock.Anything, mock.MatchedBy(func(t *models.Token) bool {
			return t.UpdatedAt.After(originalTime) && t.Status == models.TokenStatusFrozen
		})).Return(nil)

		response, err := service.FreezeToken(context.Background(), FreezeTokenRequest{
			TokenID: tokenID,
			Reason:  "Timestamp test",
		})

		assert.NoError(t, err)
		assert.NotNil(t, response)
		assert.WithinDuration(t, time.Now(), response.FrozenAt, time.Second)

		mockRepo.AssertExpectations(t)
		mockDB.AssertExpectations(t)
	})
}