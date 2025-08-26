package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"echopay/shared/libraries/errors"
	"echopay/transaction-service/src/models"
	"echopay/transaction-service/src/service"
)

// TransactionHandler handles HTTP requests for transactions
type TransactionHandler struct {
	service *service.TransactionService
}

// NewTransactionHandler creates a new transaction handler
func NewTransactionHandler(service *service.TransactionService) *TransactionHandler {
	return &TransactionHandler{service: service}
}

// CreateTransaction handles POST /api/v1/transactions
func (h *TransactionHandler) CreateTransaction(c *gin.Context) {
	var req service.TransactionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request format",
			"details": err.Error(),
		})
		return
	}

	transaction, err := h.service.ProcessTransaction(c.Request.Context(), &req)
	if err != nil {
		h.handleError(c, err)
		return
	}

	c.JSON(http.StatusCreated, gin.H{
		"transaction_id": transaction.ID,
		"status": transaction.Status,
		"timestamp": transaction.CreatedAt,
		"fraud_score": transaction.FraudScore,
		"estimated_settlement": "immediate",
	})
}

// GetTransaction handles GET /api/v1/transactions/:id
func (h *TransactionHandler) GetTransaction(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid transaction ID format",
		})
		return
	}

	transaction, err := h.service.GetTransaction(c.Request.Context(), id)
	if err != nil {
		h.handleError(c, err)
		return
	}

	c.JSON(http.StatusOK, transaction)
}

// GetTransactionsByWallet handles GET /api/v1/wallets/:wallet_id/transactions
func (h *TransactionHandler) GetTransactionsByWallet(c *gin.Context) {
	walletIDStr := c.Param("wallet_id")
	walletID, err := uuid.Parse(walletIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid wallet ID format",
		})
		return
	}

	// Parse pagination parameters
	limit := 50
	offset := 0
	
	if limitStr := c.Query("limit"); limitStr != "" {
		if parsedLimit, err := strconv.Atoi(limitStr); err == nil && parsedLimit > 0 {
			limit = parsedLimit
		}
	}
	
	if offsetStr := c.Query("offset"); offsetStr != "" {
		if parsedOffset, err := strconv.Atoi(offsetStr); err == nil && parsedOffset >= 0 {
			offset = parsedOffset
		}
	}

	transactions, err := h.service.GetTransactionsByWallet(c.Request.Context(), walletID, limit, offset)
	if err != nil {
		h.handleError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"transactions": transactions,
		"pagination": gin.H{
			"limit": limit,
			"offset": offset,
			"count": len(transactions),
		},
	})
}

// UpdateTransactionStatus handles PATCH /api/v1/transactions/:id/status
func (h *TransactionHandler) UpdateTransactionStatus(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid transaction ID format",
		})
		return
	}

	var req struct {
		Status  models.TransactionStatus `json:"status" binding:"required"`
		UserID  *uuid.UUID              `json:"user_id,omitempty"`
		Details map[string]interface{}  `json:"details,omitempty"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request format",
			"details": err.Error(),
		})
		return
	}

	err = h.service.UpdateTransactionStatus(c.Request.Context(), id, req.Status, req.UserID, req.Details)
	if err != nil {
		h.handleError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Transaction status updated successfully",
	})
}

// SetFraudScore handles PATCH /api/v1/transactions/:id/fraud-score
func (h *TransactionHandler) SetFraudScore(c *gin.Context) {
	idStr := c.Param("id")
	id, err := uuid.Parse(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid transaction ID format",
		})
		return
	}

	var req struct {
		Score   float64                `json:"score" binding:"required,min=0,max=1"`
		Details map[string]interface{} `json:"details,omitempty"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request format",
			"details": err.Error(),
		})
		return
	}

	err = h.service.SetFraudScore(c.Request.Context(), id, req.Score, req.Details)
	if err != nil {
		h.handleError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Fraud score updated successfully",
	})
}

// GetWalletBalance handles GET /api/v1/wallets/:wallet_id/balance
func (h *TransactionHandler) GetWalletBalance(c *gin.Context) {
	walletIDStr := c.Param("wallet_id")
	walletID, err := uuid.Parse(walletIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid wallet ID format",
		})
		return
	}

	currency := models.Currency(c.Query("currency"))
	if currency == "" {
		currency = models.USDCBDC // Default currency
	}

	balance, err := h.service.GetWalletBalance(c.Request.Context(), walletID, currency)
	if err != nil {
		h.handleError(c, err)
		return
	}

	c.JSON(http.StatusOK, balance)
}

// GetPendingTransactions handles GET /api/v1/transactions/pending
func (h *TransactionHandler) GetPendingTransactions(c *gin.Context) {
	limit := 100
	if limitStr := c.Query("limit"); limitStr != "" {
		if parsedLimit, err := strconv.Atoi(limitStr); err == nil && parsedLimit > 0 {
			limit = parsedLimit
		}
	}

	transactions, err := h.service.GetPendingTransactions(c.Request.Context(), limit)
	if err != nil {
		h.handleError(c, err)
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"transactions": transactions,
		"count": len(transactions),
	})
}

// GetTransactionStats handles GET /api/v1/wallets/:wallet_id/stats
func (h *TransactionHandler) GetTransactionStats(c *gin.Context) {
	walletIDStr := c.Param("wallet_id")
	walletID, err := uuid.Parse(walletIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid wallet ID format",
		})
		return
	}

	// Parse since parameter (default to 30 days ago)
	since := time.Now().AddDate(0, 0, -30)
	if sinceStr := c.Query("since"); sinceStr != "" {
		if parsedSince, err := time.Parse(time.RFC3339, sinceStr); err == nil {
			since = parsedSince
		}
	}

	stats, err := h.service.GetTransactionStats(c.Request.Context(), walletID, since)
	if err != nil {
		h.handleError(c, err)
		return
	}

	c.JSON(http.StatusOK, stats)
}

// GetServiceMetrics handles GET /api/v1/metrics/service
func (h *TransactionHandler) GetServiceMetrics(c *gin.Context) {
	metrics := h.service.GetServiceMetrics()
	
	// Calculate average processing time
	var avgProcessingTime time.Duration
	if len(metrics.ProcessingTimes) > 0 {
		var total time.Duration
		for _, t := range metrics.ProcessingTimes {
			total += t
		}
		avgProcessingTime = total / time.Duration(len(metrics.ProcessingTimes))
	}

	c.JSON(http.StatusOK, gin.H{
		"success_count": metrics.SuccessCount,
		"failure_count": metrics.FailureCount,
		"total_requests": metrics.SuccessCount + metrics.FailureCount,
		"success_rate": float64(metrics.SuccessCount) / float64(metrics.SuccessCount + metrics.FailureCount),
		"avg_processing_time_ms": avgProcessingTime.Milliseconds(),
		"recent_processing_times": len(metrics.ProcessingTimes),
	})
}

// handleError handles different types of errors and returns appropriate HTTP responses
func (h *TransactionHandler) handleError(c *gin.Context, err error) {
	if echoPayErr, ok := err.(*errors.EchoPayError); ok {
		c.JSON(echoPayErr.GetHTTPStatus(), gin.H{
			"error": echoPayErr.Code,
			"message": echoPayErr.Message,
			"service": echoPayErr.Service,
			"timestamp": echoPayErr.Timestamp,
		})
		return
	}

	// Generic error handling
	c.JSON(http.StatusInternalServerError, gin.H{
		"error": "INTERNAL_SERVER_ERROR",
		"message": "An unexpected error occurred",
		"timestamp": time.Now(),
	})
}