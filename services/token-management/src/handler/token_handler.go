package handler

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	
	"echopay/shared/libraries/errors"
	"echopay/shared/libraries/logging"
	"echopay/token-management/src/models"
	"echopay/token-management/src/service"
)

// TokenHandler handles HTTP requests for token operations
type TokenHandler struct {
	tokenService *service.TokenService
	logger       *logging.Logger
}

// NewTokenHandler creates a new token handler
func NewTokenHandler(tokenService *service.TokenService, logger *logging.Logger) *TokenHandler {
	return &TokenHandler{
		tokenService: tokenService,
		logger:       logger,
	}
}



// IssueTokens handles token issuance requests
func (h *TokenHandler) IssueTokens(c *gin.Context) {
	var req service.IssueTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		h.logger.Error("Invalid issue tokens request", "error", err)
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request format",
			"details": err.Error(),
		})
		return
	}

	response, err := h.tokenService.IssueTokens(c.Request.Context(), req)
	if err != nil {
		h.logger.Error("Failed to issue tokens", "error", err, "request", req)
		
		if tokenErr, ok := err.(*errors.EchoPayError); ok {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": tokenErr.Message,
				"code": tokenErr.Code,
			})
			return
		}
		
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to issue tokens",
		})
		return
	}

	h.logger.Info("Tokens issued successfully", "count", response.Count, "owner", req.Owner)
	c.JSON(http.StatusCreated, response)
}

// GetToken handles token retrieval requests
func (h *TokenHandler) GetToken(c *gin.Context) {
	tokenIDStr := c.Param("id")
	tokenID, err := uuid.Parse(tokenIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid token ID format",
		})
		return
	}

	token, err := h.tokenService.GetToken(c.Request.Context(), tokenID)
	if err != nil {
		h.logger.Error("Failed to get token", "error", err, "token_id", tokenID)
		
		if tokenErr, ok := err.(*errors.EchoPayError); ok {
			if tokenErr.Code == errors.ErrTokenNotFound {
				c.JSON(http.StatusNotFound, gin.H{
					"error": "Token not found",
				})
				return
			}
			
			c.JSON(http.StatusBadRequest, gin.H{
				"error": tokenErr.Message,
				"code": tokenErr.Code,
			})
			return
		}
		
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to retrieve token",
		})
		return
	}

	c.JSON(http.StatusOK, token)
}

// TransferToken handles token transfer requests
func (h *TokenHandler) TransferToken(c *gin.Context) {
	tokenIDStr := c.Param("id")
	tokenID, err := uuid.Parse(tokenIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid token ID format",
		})
		return
	}

	var req service.TransferTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		h.logger.Error("Invalid transfer token request", "error", err)
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request format",
			"details": err.Error(),
		})
		return
	}

	// Set token ID from URL parameter
	req.TokenID = tokenID

	response, err := h.tokenService.TransferToken(c.Request.Context(), req)
	if err != nil {
		h.logger.Error("Failed to transfer token", "error", err, "request", req)
		
		if tokenErr, ok := err.(*errors.EchoPayError); ok {
			statusCode := http.StatusBadRequest
			if tokenErr.Code == errors.ErrTokenNotFound {
				statusCode = http.StatusNotFound
			} else if tokenErr.Code == errors.ErrTokenFrozen {
				statusCode = http.StatusConflict
			}
			
			c.JSON(statusCode, gin.H{
				"error": tokenErr.Message,
				"code": tokenErr.Code,
			})
			return
		}
		
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to transfer token",
		})
		return
	}

	h.logger.Info("Token transferred successfully", "token_id", tokenID, "new_owner", req.NewOwner)
	c.JSON(http.StatusOK, response)
}

// DestroyToken handles token destruction requests
func (h *TokenHandler) DestroyToken(c *gin.Context) {
	tokenIDStr := c.Param("id")
	tokenID, err := uuid.Parse(tokenIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid token ID format",
		})
		return
	}

	err = h.tokenService.DestroyToken(c.Request.Context(), tokenID)
	if err != nil {
		h.logger.Error("Failed to destroy token", "error", err, "token_id", tokenID)
		
		if tokenErr, ok := err.(*errors.EchoPayError); ok {
			statusCode := http.StatusBadRequest
			if tokenErr.Code == errors.ErrTokenNotFound {
				statusCode = http.StatusNotFound
			}
			
			c.JSON(statusCode, gin.H{
				"error": tokenErr.Message,
				"code": tokenErr.Code,
			})
			return
		}
		
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to destroy token",
		})
		return
	}

	h.logger.Info("Token destroyed successfully", "token_id", tokenID)
	c.JSON(http.StatusOK, gin.H{
		"message": "Token destroyed successfully",
		"token_id": tokenID,
	})
}

// GetTokenHistory handles token history retrieval requests
func (h *TokenHandler) GetTokenHistory(c *gin.Context) {
	tokenIDStr := c.Param("id")
	tokenID, err := uuid.Parse(tokenIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid token ID format",
		})
		return
	}

	history, err := h.tokenService.GetTokenHistory(c.Request.Context(), tokenID)
	if err != nil {
		h.logger.Error("Failed to get token history", "error", err, "token_id", tokenID)
		
		if tokenErr, ok := err.(*errors.EchoPayError); ok {
			if tokenErr.Code == errors.ErrTokenNotFound {
				c.JSON(http.StatusNotFound, gin.H{
					"error": "Token not found",
				})
				return
			}
		}
		
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to retrieve token history",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token_id": tokenID,
		"transaction_history": history,
	})
}

// GetWalletTokens handles wallet token listing requests
func (h *TokenHandler) GetWalletTokens(c *gin.Context) {
	walletIDStr := c.Param("id")
	walletID, err := uuid.Parse(walletIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid wallet ID format",
		})
		return
	}

	// Optional query parameters for filtering
	statusFilter := c.Query("status")
	cbdcTypeFilter := c.Query("cbdc_type")
	limitStr := c.DefaultQuery("limit", "100")
	offsetStr := c.DefaultQuery("offset", "0")

	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 || limit > 1000 {
		limit = 100
	}

	offset, err := strconv.Atoi(offsetStr)
	if err != nil || offset < 0 {
		offset = 0
	}

	tokens, err := h.tokenService.GetTokensByOwner(c.Request.Context(), walletID)
	if err != nil {
		h.logger.Error("Failed to get wallet tokens", "error", err, "wallet_id", walletID)
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to retrieve wallet tokens",
		})
		return
	}

	// Apply filters
	filteredTokens := tokens
	if statusFilter != "" {
		var filtered []models.Token
		for _, token := range filteredTokens {
			if string(token.Status) == statusFilter {
				filtered = append(filtered, token)
			}
		}
		filteredTokens = filtered
	}

	if cbdcTypeFilter != "" {
		var filtered []models.Token
		for _, token := range filteredTokens {
			if string(token.CBDCType) == cbdcTypeFilter {
				filtered = append(filtered, token)
			}
		}
		filteredTokens = filtered
	}

	// Apply pagination
	total := len(filteredTokens)
	start := offset
	end := offset + limit

	if start >= total {
		filteredTokens = []models.Token{}
	} else {
		if end > total {
			end = total
		}
		filteredTokens = filteredTokens[start:end]
	}

	c.JSON(http.StatusOK, gin.H{
		"wallet_id": walletID,
		"tokens": filteredTokens,
		"pagination": gin.H{
			"total": total,
			"limit": limit,
			"offset": offset,
			"count": len(filteredTokens),
		},
	})
}

// VerifyOwnership handles ownership verification requests
func (h *TokenHandler) VerifyOwnership(c *gin.Context) {
	tokenIDStr := c.Param("id")
	tokenID, err := uuid.Parse(tokenIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid token ID format",
		})
		return
	}

	ownerIDStr := c.Param("owner")
	ownerID, err := uuid.Parse(ownerIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid owner ID format",
		})
		return
	}

	isOwner, err := h.tokenService.VerifyOwnership(c.Request.Context(), tokenID, ownerID)
	if err != nil {
		h.logger.Error("Failed to verify ownership", "error", err, "token_id", tokenID, "owner_id", ownerID)
		
		if tokenErr, ok := err.(*errors.EchoPayError); ok {
			if tokenErr.Code == errors.ErrTokenNotFound {
				c.JSON(http.StatusNotFound, gin.H{
					"error": "Token not found",
				})
				return
			}
		}
		
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to verify ownership",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token_id": tokenID,
		"owner_id": ownerID,
		"is_owner": isOwner,
	})
}

// FreezeToken handles token freezing requests
func (h *TokenHandler) FreezeToken(c *gin.Context) {
	tokenIDStr := c.Param("id")
	tokenID, err := uuid.Parse(tokenIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid token ID format",
		})
		return
	}

	var req service.FreezeTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		h.logger.Error("Invalid freeze token request", "error", err)
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request format",
			"details": err.Error(),
		})
		return
	}

	// Set token ID from URL parameter
	req.TokenID = tokenID

	response, err := h.tokenService.FreezeToken(c.Request.Context(), req)
	if err != nil {
		h.logger.Error("Failed to freeze token", "error", err, "token_id", tokenID)
		
		if tokenErr, ok := err.(*errors.EchoPayError); ok {
			statusCode := http.StatusBadRequest
			if tokenErr.Code == errors.ErrTokenNotFound {
				statusCode = http.StatusNotFound
			}
			
			c.JSON(statusCode, gin.H{
				"error": tokenErr.Message,
				"code": tokenErr.Code,
			})
			return
		}
		
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to freeze token",
		})
		return
	}

	h.logger.Info("Token frozen successfully", "token_id", tokenID, "reason", req.Reason)
	c.JSON(http.StatusOK, response)
}

// UnfreezeToken handles token unfreezing requests
func (h *TokenHandler) UnfreezeToken(c *gin.Context) {
	tokenIDStr := c.Param("id")
	tokenID, err := uuid.Parse(tokenIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid token ID format",
		})
		return
	}

	var req service.UnfreezeTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		h.logger.Error("Invalid unfreeze token request", "error", err)
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request format",
			"details": err.Error(),
		})
		return
	}

	// Set token ID from URL parameter
	req.TokenID = tokenID

	response, err := h.tokenService.UnfreezeToken(c.Request.Context(), req)
	if err != nil {
		h.logger.Error("Failed to unfreeze token", "error", err, "token_id", tokenID)
		
		if tokenErr, ok := err.(*errors.EchoPayError); ok {
			statusCode := http.StatusBadRequest
			if tokenErr.Code == errors.ErrTokenNotFound {
				statusCode = http.StatusNotFound
			}
			
			c.JSON(statusCode, gin.H{
				"error": tokenErr.Message,
				"code": tokenErr.Code,
			})
			return
		}
		
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to unfreeze token",
		})
		return
	}

	h.logger.Info("Token unfrozen successfully", "token_id", tokenID, "reason", req.Reason)
	c.JSON(http.StatusOK, response)
}

// BulkUpdateStatus handles bulk status update requests (for reversibility service)
func (h *TokenHandler) BulkUpdateStatus(c *gin.Context) {
	var req service.BulkStatusUpdateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		h.logger.Error("Invalid bulk update status request", "error", err)
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request format",
			"details": err.Error(),
		})
		return
	}

	response, err := h.tokenService.BulkUpdateTokenStatus(c.Request.Context(), req)
	if err != nil {
		h.logger.Error("Failed to bulk update token status", "error", err, "token_count", len(req.TokenIDs))
		
		if tokenErr, ok := err.(*errors.EchoPayError); ok {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": tokenErr.Message,
				"code": tokenErr.Code,
			})
			return
		}
		
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to bulk update token status",
		})
		return
	}

	h.logger.Info("Bulk status update completed", "updated_count", response.UpdatedCount, "status", response.NewStatus)
	c.JSON(http.StatusOK, response)
}

// BulkFreezeTokens handles bulk token freezing requests
func (h *TokenHandler) BulkFreezeTokens(c *gin.Context) {
	var req struct {
		TokenIDs []uuid.UUID `json:"token_ids" binding:"required"`
		Reason   string      `json:"reason,omitempty"`
	}
	
	if err := c.ShouldBindJSON(&req); err != nil {
		h.logger.Error("Invalid bulk freeze request", "error", err)
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request format",
			"details": err.Error(),
		})
		return
	}

	response, err := h.tokenService.BulkFreezeTokens(c.Request.Context(), req.TokenIDs, req.Reason)
	if err != nil {
		h.logger.Error("Failed to bulk freeze tokens", "error", err, "token_count", len(req.TokenIDs))
		
		if tokenErr, ok := err.(*errors.EchoPayError); ok {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": tokenErr.Message,
				"code": tokenErr.Code,
			})
			return
		}
		
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to bulk freeze tokens",
		})
		return
	}

	h.logger.Info("Bulk freeze completed", "frozen_count", response.UpdatedCount, "reason", req.Reason)
	c.JSON(http.StatusOK, response)
}

// BulkUnfreezeTokens handles bulk token unfreezing requests
func (h *TokenHandler) BulkUnfreezeTokens(c *gin.Context) {
	var req struct {
		TokenIDs []uuid.UUID `json:"token_ids" binding:"required"`
		Reason   string      `json:"reason,omitempty"`
	}
	
	if err := c.ShouldBindJSON(&req); err != nil {
		h.logger.Error("Invalid bulk unfreeze request", "error", err)
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid request format",
			"details": err.Error(),
		})
		return
	}

	response, err := h.tokenService.BulkUnfreezeTokens(c.Request.Context(), req.TokenIDs, req.Reason)
	if err != nil {
		h.logger.Error("Failed to bulk unfreeze tokens", "error", err, "token_count", len(req.TokenIDs))
		
		if tokenErr, ok := err.(*errors.EchoPayError); ok {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": tokenErr.Message,
				"code": tokenErr.Code,
			})
			return
		}
		
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to bulk unfreeze tokens",
		})
		return
	}

	h.logger.Info("Bulk unfreeze completed", "unfrozen_count", response.UpdatedCount, "reason", req.Reason)
	c.JSON(http.StatusOK, response)
}

// GetTokensByStatus handles requests to get tokens by status
func (h *TokenHandler) GetTokensByStatus(c *gin.Context) {
	statusStr := c.Param("status")
	status := models.TokenStatus(statusStr)

	tokens, err := h.tokenService.GetTokensByStatus(c.Request.Context(), status)
	if err != nil {
		h.logger.Error("Failed to get tokens by status", "error", err, "status", status)
		
		if tokenErr, ok := err.(*errors.EchoPayError); ok {
			c.JSON(http.StatusBadRequest, gin.H{
				"error": tokenErr.Message,
				"code": tokenErr.Code,
			})
			return
		}
		
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to retrieve tokens by status",
		})
		return
	}

	h.logger.Info("Retrieved tokens by status", "status", status, "count", len(tokens))
	c.JSON(http.StatusOK, gin.H{
		"status": status,
		"tokens": tokens,
		"count": len(tokens),
	})
}

// GetTokensByCBDCType handles requests to get tokens by CBDC type
func (h *TokenHandler) GetTokensByCBDCType(c *gin.Context) {
	cbdcTypeStr := c.Param("type")
	cbdcType := models.CBDCType(cbdcTypeStr)

	// Validate CBDC type
	validTypes := map[models.CBDCType]bool{
		models.CBDCTypeUSD: true,
		models.CBDCTypeEUR: true,
		models.CBDCTypeGBP: true,
	}

	if !validTypes[cbdcType] {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid CBDC type",
			"valid_types": []string{"USD-CBDC", "EUR-CBDC", "GBP-CBDC"},
		})
		return
	}

	// This would typically be implemented in the service layer
	h.logger.Info("Get tokens by CBDC type requested", "cbdc_type", cbdcType)
	
	c.JSON(http.StatusOK, gin.H{
		"cbdc_type": cbdcType,
		"tokens": []models.Token{}, // Placeholder
		"count": 0,
	})
}

// GetTokenAuditTrail handles audit trail retrieval requests
func (h *TokenHandler) GetTokenAuditTrail(c *gin.Context) {
	tokenIDStr := c.Param("id")
	tokenID, err := uuid.Parse(tokenIDStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Invalid token ID format",
		})
		return
	}

	auditTrail, err := h.tokenService.GetTokenAuditTrail(c.Request.Context(), tokenID)
	if err != nil {
		h.logger.Error("Failed to get token audit trail", "error", err, "token_id", tokenID)
		
		if tokenErr, ok := err.(*errors.EchoPayError); ok {
			if tokenErr.Code == errors.ErrTokenNotFound {
				c.JSON(http.StatusNotFound, gin.H{
					"error": "Token not found",
				})
				return
			}
			
			c.JSON(http.StatusBadRequest, gin.H{
				"error": tokenErr.Message,
				"code": tokenErr.Code,
			})
			return
		}
		
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to retrieve token audit trail",
		})
		return
	}

	h.logger.Info("Retrieved token audit trail", "token_id", tokenID, "entries", len(auditTrail))
	c.JSON(http.StatusOK, gin.H{
		"token_id": tokenID,
		"audit_trail": auditTrail,
		"count": len(auditTrail),
	})
}