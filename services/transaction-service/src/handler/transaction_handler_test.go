package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	
	"echopay/shared/libraries/database"
	"echopay/transaction-service/src/models"
	"echopay/transaction-service/src/service"
)

func setupTestHandler(t *testing.T) (*TransactionHandler, *service.TransactionService) {
	config := database.DefaultConfig()
	config.Database = "echopay_test"
	
	db, err := database.NewPostgresDB(config)
	require.NoError(t, err)
	
	transactionService := service.NewTransactionService(db)
	
	// Run migrations
	err = transactionService.Migrate()
	require.NoError(t, err)
	
	handler := NewTransactionHandler(transactionService)
	
	return handler, transactionService
}

func setupTestWalletsForHandler(t *testing.T, service *service.TransactionService) (uuid.UUID, uuid.UUID) {
	fromWallet := uuid.New()
	toWallet := uuid.New()
	
	// Create wallets with initial balances
	err := service.GetBalanceRepo().CreateWallet(fromWallet)
	require.NoError(t, err)
	
	err = service.GetBalanceRepo().CreateWallet(toWallet)
	require.NoError(t, err)
	
	// Add funds to sender wallet
	err = service.GetBalanceRepo().AddFunds(fromWallet, models.USDCBDC, 1000.0)
	require.NoError(t, err)
	
	return fromWallet, toWallet
}

func TestTransactionHandler_CreateTransaction_Success(t *testing.T) {
	handler, service := setupTestHandler(t)
	fromWallet, toWallet := setupTestWalletsForHandler(t, service)
	
	// Set up Gin in test mode
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/api/v1/transactions", handler.CreateTransaction)
	
	// Create request
	reqBody := service.TransactionRequest{
		FromWallet: fromWallet,
		ToWallet:   toWallet,
		Amount:     100.0,
		Currency:   models.USDCBDC,
		Metadata: models.TransactionMetadata{
			Description: "Test payment",
			Category:    "test",
		},
	}
	
	jsonBody, err := json.Marshal(reqBody)
	require.NoError(t, err)
	
	// Make request
	req, err := http.NewRequest("POST", "/api/v1/transactions", bytes.NewBuffer(jsonBody))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	
	// Assert response
	assert.Equal(t, http.StatusCreated, w.Code)
	
	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	
	assert.Contains(t, response, "transaction_id")
	assert.Equal(t, "completed", response["status"])
	assert.Equal(t, "immediate", response["estimated_settlement"])
}

func TestTransactionHandler_CreateTransaction_InvalidRequest(t *testing.T) {
	handler, _ := setupTestHandler(t)
	
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/api/v1/transactions", handler.CreateTransaction)
	
	// Create invalid request (missing required fields)
	reqBody := map[string]interface{}{
		"amount": 100.0,
		// Missing from_wallet and to_wallet
	}
	
	jsonBody, err := json.Marshal(reqBody)
	require.NoError(t, err)
	
	req, err := http.NewRequest("POST", "/api/v1/transactions", bytes.NewBuffer(jsonBody))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	
	assert.Equal(t, http.StatusBadRequest, w.Code)
	
	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	
	assert.Contains(t, response, "error")
	assert.Equal(t, "Invalid request format", response["error"])
}

func TestTransactionHandler_CreateTransaction_InsufficientFunds(t *testing.T) {
	handler, service := setupTestHandler(t)
	fromWallet, toWallet := setupTestWalletsForHandler(t, service)
	
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.POST("/api/v1/transactions", handler.CreateTransaction)
	
	// Create request with amount exceeding balance
	reqBody := service.TransactionRequest{
		FromWallet: fromWallet,
		ToWallet:   toWallet,
		Amount:     2000.0, // More than available balance
		Currency:   models.USDCBDC,
	}
	
	jsonBody, err := json.Marshal(reqBody)
	require.NoError(t, err)
	
	req, err := http.NewRequest("POST", "/api/v1/transactions", bytes.NewBuffer(jsonBody))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	
	assert.Equal(t, http.StatusPaymentRequired, w.Code)
	
	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	
	assert.Equal(t, "INSUFFICIENT_FUNDS", response["error"])
}

func TestTransactionHandler_GetTransaction_Success(t *testing.T) {
	handler, service := setupTestHandler(t)
	fromWallet, toWallet := setupTestWalletsForHandler(t, service)
	
	// Create a transaction first
	reqBody := &service.TransactionRequest{
		FromWallet: fromWallet,
		ToWallet:   toWallet,
		Amount:     100.0,
		Currency:   models.USDCBDC,
	}
	
	transaction, err := service.ProcessTransaction(nil, reqBody)
	require.NoError(t, err)
	
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/api/v1/transactions/:id", handler.GetTransaction)
	
	// Make request
	req, err := http.NewRequest("GET", fmt.Sprintf("/api/v1/transactions/%s", transaction.ID), nil)
	require.NoError(t, err)
	
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	
	assert.Equal(t, http.StatusOK, w.Code)
	
	var response models.Transaction
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	
	assert.Equal(t, transaction.ID, response.ID)
	assert.Equal(t, transaction.Amount, response.Amount)
	assert.Equal(t, models.StatusCompleted, response.Status)
}

func TestTransactionHandler_GetTransaction_NotFound(t *testing.T) {
	handler, _ := setupTestHandler(t)
	
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/api/v1/transactions/:id", handler.GetTransaction)
	
	nonExistentID := uuid.New()
	req, err := http.NewRequest("GET", fmt.Sprintf("/api/v1/transactions/%s", nonExistentID), nil)
	require.NoError(t, err)
	
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	
	assert.Equal(t, http.StatusNotFound, w.Code)
	
	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	
	assert.Equal(t, "TRANSACTION_NOT_FOUND", response["error"])
}

func TestTransactionHandler_GetTransaction_InvalidID(t *testing.T) {
	handler, _ := setupTestHandler(t)
	
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/api/v1/transactions/:id", handler.GetTransaction)
	
	req, err := http.NewRequest("GET", "/api/v1/transactions/invalid-uuid", nil)
	require.NoError(t, err)
	
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	
	assert.Equal(t, http.StatusBadRequest, w.Code)
	
	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	
	assert.Equal(t, "Invalid transaction ID format", response["error"])
}

func TestTransactionHandler_UpdateTransactionStatus(t *testing.T) {
	handler, service := setupTestHandler(t)
	fromWallet, toWallet := setupTestWalletsForHandler(t, service)
	
	// Create a transaction first
	reqBody := &service.TransactionRequest{
		FromWallet: fromWallet,
		ToWallet:   toWallet,
		Amount:     100.0,
		Currency:   models.USDCBDC,
	}
	
	transaction, err := service.ProcessTransaction(nil, reqBody)
	require.NoError(t, err)
	
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.PATCH("/api/v1/transactions/:id/status", handler.UpdateTransactionStatus)
	
	// Update status
	updateReq := map[string]interface{}{
		"status": models.StatusReversed,
		"details": map[string]interface{}{
			"reason": "fraud detected",
		},
	}
	
	jsonBody, err := json.Marshal(updateReq)
	require.NoError(t, err)
	
	req, err := http.NewRequest("PATCH", fmt.Sprintf("/api/v1/transactions/%s/status", transaction.ID), bytes.NewBuffer(jsonBody))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	
	assert.Equal(t, http.StatusOK, w.Code)
	
	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	
	assert.Equal(t, "Transaction status updated successfully", response["message"])
}

func TestTransactionHandler_SetFraudScore(t *testing.T) {
	handler, service := setupTestHandler(t)
	fromWallet, toWallet := setupTestWalletsForHandler(t, service)
	
	// Create a transaction first
	reqBody := &service.TransactionRequest{
		FromWallet: fromWallet,
		ToWallet:   toWallet,
		Amount:     100.0,
		Currency:   models.USDCBDC,
	}
	
	transaction, err := service.ProcessTransaction(nil, reqBody)
	require.NoError(t, err)
	
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.PATCH("/api/v1/transactions/:id/fraud-score", handler.SetFraudScore)
	
	// Set fraud score
	scoreReq := map[string]interface{}{
		"score": 0.75,
		"details": map[string]interface{}{
			"model": "isolation_forest",
		},
	}
	
	jsonBody, err := json.Marshal(scoreReq)
	require.NoError(t, err)
	
	req, err := http.NewRequest("PATCH", fmt.Sprintf("/api/v1/transactions/%s/fraud-score", transaction.ID), bytes.NewBuffer(jsonBody))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")
	
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	
	assert.Equal(t, http.StatusOK, w.Code)
	
	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	
	assert.Equal(t, "Fraud score updated successfully", response["message"])
}

func TestTransactionHandler_GetWalletBalance(t *testing.T) {
	handler, service := setupTestHandler(t)
	fromWallet, _ := setupTestWalletsForHandler(t, service)
	
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/api/v1/wallets/:wallet_id/balance", handler.GetWalletBalance)
	
	req, err := http.NewRequest("GET", fmt.Sprintf("/api/v1/wallets/%s/balance?currency=USD-CBDC", fromWallet), nil)
	require.NoError(t, err)
	
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	
	assert.Equal(t, http.StatusOK, w.Code)
	
	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	
	assert.Equal(t, fromWallet.String(), response["wallet_id"])
	assert.Equal(t, "USD-CBDC", response["currency"])
	assert.Equal(t, 1000.0, response["balance"])
}

func TestTransactionHandler_GetTransactionsByWallet(t *testing.T) {
	handler, service := setupTestHandler(t)
	fromWallet, toWallet := setupTestWalletsForHandler(t, service)
	
	// Create multiple transactions
	for i := 0; i < 3; i++ {
		reqBody := &service.TransactionRequest{
			FromWallet: fromWallet,
			ToWallet:   toWallet,
			Amount:     float64(10 * (i + 1)),
			Currency:   models.USDCBDC,
		}
		
		_, err := service.ProcessTransaction(nil, reqBody)
		require.NoError(t, err)
	}
	
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/api/v1/wallets/:wallet_id/transactions", handler.GetTransactionsByWallet)
	
	req, err := http.NewRequest("GET", fmt.Sprintf("/api/v1/wallets/%s/transactions", fromWallet), nil)
	require.NoError(t, err)
	
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	
	assert.Equal(t, http.StatusOK, w.Code)
	
	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	
	transactions := response["transactions"].([]interface{})
	assert.Len(t, transactions, 3)
	
	pagination := response["pagination"].(map[string]interface{})
	assert.Equal(t, float64(50), pagination["limit"])
	assert.Equal(t, float64(0), pagination["offset"])
	assert.Equal(t, float64(3), pagination["count"])
}

func TestTransactionHandler_GetServiceMetrics(t *testing.T) {
	handler, service := setupTestHandler(t)
	fromWallet, toWallet := setupTestWalletsForHandler(t, service)
	
	// Create some transactions to generate metrics
	for i := 0; i < 5; i++ {
		reqBody := &service.TransactionRequest{
			FromWallet: fromWallet,
			ToWallet:   toWallet,
			Amount:     10.0,
			Currency:   models.USDCBDC,
		}
		
		_, err := service.ProcessTransaction(nil, reqBody)
		if err != nil {
			break // Expected after insufficient funds
		}
	}
	
	gin.SetMode(gin.TestMode)
	router := gin.New()
	router.GET("/api/v1/metrics/service", handler.GetServiceMetrics)
	
	req, err := http.NewRequest("GET", "/api/v1/metrics/service", nil)
	require.NoError(t, err)
	
	w := httptest.NewRecorder()
	router.ServeHTTP(w, req)
	
	assert.Equal(t, http.StatusOK, w.Code)
	
	var response map[string]interface{}
	err = json.Unmarshal(w.Body.Bytes(), &response)
	require.NoError(t, err)
	
	assert.Contains(t, response, "success_count")
	assert.Contains(t, response, "failure_count")
	assert.Contains(t, response, "total_requests")
	assert.Contains(t, response, "success_rate")
	assert.Contains(t, response, "avg_processing_time_ms")
	
	// Verify metrics are reasonable
	successCount := response["success_count"].(float64)
	assert.True(t, successCount > 0)
	
	avgProcessingTime := response["avg_processing_time_ms"].(float64)
	assert.True(t, avgProcessingTime < 1000) // Should be sub-second
}