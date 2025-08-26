package config

import (
	"os"
	"strconv"
	"time"
)

// DatabaseConfig holds database connection configuration
type DatabaseConfig struct {
	Host     string
	Port     int
	Database string
	User     string
	Password string
	SSLMode  string
}

// KafkaConfig holds Kafka connection configuration
type KafkaConfig struct {
	Brokers []string
	GroupID string
}

// RedisConfig holds Redis connection configuration
type RedisConfig struct {
	Host     string
	Port     int
	Password string
	DB       int
}

// ServiceConfig holds common service configuration
type ServiceConfig struct {
	Port            int
	Environment     string
	LogLevel        string
	MetricsEnabled  bool
	HealthCheckPath string
	ReadTimeout     time.Duration
	WriteTimeout    time.Duration
}

// GetDatabaseConfig returns database configuration from environment variables
func GetDatabaseConfig() DatabaseConfig {
	return DatabaseConfig{
		Host:     getEnv("DB_HOST", "localhost"),
		Port:     getEnvAsInt("DB_PORT", 5432),
		Database: getEnv("DB_NAME", "echopay"),
		User:     getEnv("DB_USER", "echopay"),
		Password: getEnv("DB_PASSWORD", "echopay_dev"),
		SSLMode:  getEnv("DB_SSL_MODE", "disable"),
	}
}

// GetKafkaConfig returns Kafka configuration from environment variables
func GetKafkaConfig() KafkaConfig {
	brokers := getEnv("KAFKA_BROKERS", "localhost:9092")
	return KafkaConfig{
		Brokers: []string{brokers},
		GroupID: getEnv("KAFKA_GROUP_ID", "echopay-default"),
	}
}

// GetRedisConfig returns Redis configuration from environment variables
func GetRedisConfig() RedisConfig {
	return RedisConfig{
		Host:     getEnv("REDIS_HOST", "localhost"),
		Port:     getEnvAsInt("REDIS_PORT", 6379),
		Password: getEnv("REDIS_PASSWORD", ""),
		DB:       getEnvAsInt("REDIS_DB", 0),
	}
}

// GetServiceConfig returns service configuration from environment variables
func GetServiceConfig(defaultPort int) ServiceConfig {
	return ServiceConfig{
		Port:            getEnvAsInt("PORT", defaultPort),
		Environment:     getEnv("ENVIRONMENT", "development"),
		LogLevel:        getEnv("LOG_LEVEL", "info"),
		MetricsEnabled:  getEnvAsBool("METRICS_ENABLED", true),
		HealthCheckPath: getEnv("HEALTH_CHECK_PATH", "/health"),
		ReadTimeout:     getEnvAsDuration("READ_TIMEOUT", 30*time.Second),
		WriteTimeout:    getEnvAsDuration("WRITE_TIMEOUT", 30*time.Second),
	}
}

// Helper functions to get environment variables with defaults
func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvAsInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intValue, err := strconv.Atoi(value); err == nil {
			return intValue
		}
	}
	return defaultValue
}

func getEnvAsBool(key string, defaultValue bool) bool {
	if value := os.Getenv(key); value != "" {
		if boolValue, err := strconv.ParseBool(value); err == nil {
			return boolValue
		}
	}
	return defaultValue
}

func getEnvAsDuration(key string, defaultValue time.Duration) time.Duration {
	if value := os.Getenv(key); value != "" {
		if duration, err := time.ParseDuration(value); err == nil {
			return duration
		}
	}
	return defaultValue
}

// GetConnectionString returns a PostgreSQL connection string
func (db DatabaseConfig) GetConnectionString() string {
	return "host=" + db.Host +
		" port=" + strconv.Itoa(db.Port) +
		" user=" + db.User +
		" password=" + db.Password +
		" dbname=" + db.Database +
		" sslmode=" + db.SSLMode
}