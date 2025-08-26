package main

import (
	"fmt"
	"log"
	"time"

	"github.com/gin-gonic/gin"
	
	"echopay/shared/libraries/config"
	"echopay/shared/libraries/database"
	"echopay/shared/libraries/http"
	"echopay/shared/libraries/logging"
	"echopay/shared/libraries/monitoring"
	"echopay/token-management/src/handler"
	"echopay/token-management/src/migrations"
	"echopay/token-management/src/service"
)

func main() {
	// Initialize configuration
	cfg := config.GetServiceConfig(8003)
	
	// Initialize logger
	logger := logging.NewLogger("token-management")
	
	// Initialize metrics
	_ = monitoring.NewMetrics("token-management")
	
	// Initialize database
	dbConfig := database.DatabaseConfig{
		Host:            "localhost",
		Port:            5432,
		Database:        "echopay_tokens",
		User:            "echopay",
		Password:        "echopay_dev",
		SSLMode:         "disable",
		MaxOpenConns:    25,
		MaxIdleConns:    5,
		ConnMaxLifetime: 5 * time.Minute,
	}
	
	db, err := database.NewPostgresDB(dbConfig)
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	defer db.Close()
	
	// Run database migrations
	if err := db.Migrate(migrations.GetTokenMigrations()); err != nil {
		log.Fatal("Failed to run database migrations:", err)
	}
	
	logger.Info("Database connected and migrations applied")
	
	// Initialize services
	tokenService := service.NewTokenService(db)
	
	// Initialize handlers
	tokenHandler := handler.NewTokenHandler(tokenService, logger)
	
	// Set Gin mode based on environment
	if cfg.Environment == "production" {
		gin.SetMode(gin.ReleaseMode)
	}
	
	// Create Gin router
	r := gin.New()
	
	// Add middleware
	r.Use(http.RequestIDMiddleware())
	r.Use(http.CORSMiddleware())
	r.Use(http.MetricsMiddleware("token-management"))
	r.Use(http.ErrorHandler())
	r.Use(http.RateLimitMiddleware(500)) // 500 requests per minute
	
	// Health check endpoint
	r.GET("/health", func(c *gin.Context) {
		// Check database health
		if err := db.HealthCheck(); err != nil {
			c.JSON(503, gin.H{
				"status": "unhealthy",
				"service": "token-management",
				"database": "unhealthy",
				"error": err.Error(),
			})
			return
		}
		
		c.JSON(200, gin.H{
			"status": "healthy",
			"service": "token-management",
			"database": "healthy",
			"timestamp": time.Now().UTC(),
		})
	})
	
	// Metrics endpoint
	r.GET("/metrics", http.MetricsHandler())
	
	// API routes
	v1 := r.Group("/api/v1")
	{
		// Token management endpoints
		v1.POST("/tokens", tokenHandler.IssueTokens)
		v1.GET("/tokens/:id", tokenHandler.GetToken)
		v1.POST("/tokens/:id/transfer", tokenHandler.TransferToken)
		v1.DELETE("/tokens/:id", tokenHandler.DestroyToken)
		v1.GET("/tokens/:id/history", tokenHandler.GetTokenHistory)
		v1.GET("/tokens/:id/audit", tokenHandler.GetTokenAuditTrail)
		
		// Wallet endpoints
		v1.GET("/wallets/:id/tokens", tokenHandler.GetWalletTokens)
		
		// Ownership verification
		v1.GET("/tokens/:id/verify/:owner", tokenHandler.VerifyOwnership)
		
		// Bulk operations (for reversibility service)
		v1.POST("/tokens/bulk/status", tokenHandler.BulkUpdateStatus)
		v1.GET("/tokens/status/:status", tokenHandler.GetTokensByStatus)
		v1.GET("/tokens/cbdc/:type", tokenHandler.GetTokensByCBDCType)
	}
	
	logger.Info("Token Management Service starting", "port", cfg.Port, "environment", cfg.Environment)
	
	// Start server
	addr := fmt.Sprintf(":%d", cfg.Port)
	if err := r.Run(addr); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}