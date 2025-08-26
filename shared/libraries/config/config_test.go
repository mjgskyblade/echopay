package config

import (
	"os"
	"testing"
	"time"
)

func TestGetDatabaseConfig(t *testing.T) {
	// Test with default values
	config := GetDatabaseConfig()
	
	if config.Host != "localhost" {
		t.Errorf("Expected default host 'localhost', got %s", config.Host)
	}
	
	if config.Port != 5432 {
		t.Errorf("Expected default port 5432, got %d", config.Port)
	}
	
	if config.Database != "echopay" {
		t.Errorf("Expected default database 'echopay', got %s", config.Database)
	}
}

func TestGetDatabaseConfigWithEnvVars(t *testing.T) {
	// Set environment variables
	os.Setenv("DB_HOST", "testhost")
	os.Setenv("DB_PORT", "3306")
	os.Setenv("DB_NAME", "testdb")
	os.Setenv("DB_USER", "testuser")
	os.Setenv("DB_PASSWORD", "testpass")
	
	defer func() {
		// Clean up
		os.Unsetenv("DB_HOST")
		os.Unsetenv("DB_PORT")
		os.Unsetenv("DB_NAME")
		os.Unsetenv("DB_USER")
		os.Unsetenv("DB_PASSWORD")
	}()
	
	config := GetDatabaseConfig()
	
	if config.Host != "testhost" {
		t.Errorf("Expected host 'testhost', got %s", config.Host)
	}
	
	if config.Port != 3306 {
		t.Errorf("Expected port 3306, got %d", config.Port)
	}
	
	if config.Database != "testdb" {
		t.Errorf("Expected database 'testdb', got %s", config.Database)
	}
	
	if config.User != "testuser" {
		t.Errorf("Expected user 'testuser', got %s", config.User)
	}
	
	if config.Password != "testpass" {
		t.Errorf("Expected password 'testpass', got %s", config.Password)
	}
}

func TestGetServiceConfig(t *testing.T) {
	config := GetServiceConfig(8080)
	
	if config.Port != 8080 {
		t.Errorf("Expected port 8080, got %d", config.Port)
	}
	
	if config.Environment != "development" {
		t.Errorf("Expected environment 'development', got %s", config.Environment)
	}
	
	if config.LogLevel != "info" {
		t.Errorf("Expected log level 'info', got %s", config.LogLevel)
	}
	
	if !config.MetricsEnabled {
		t.Error("Expected metrics to be enabled by default")
	}
}

func TestGetServiceConfigWithEnvVars(t *testing.T) {
	os.Setenv("PORT", "9000")
	os.Setenv("ENVIRONMENT", "production")
	os.Setenv("LOG_LEVEL", "debug")
	os.Setenv("METRICS_ENABLED", "false")
	
	defer func() {
		os.Unsetenv("PORT")
		os.Unsetenv("ENVIRONMENT")
		os.Unsetenv("LOG_LEVEL")
		os.Unsetenv("METRICS_ENABLED")
	}()
	
	config := GetServiceConfig(8080)
	
	if config.Port != 9000 {
		t.Errorf("Expected port 9000, got %d", config.Port)
	}
	
	if config.Environment != "production" {
		t.Errorf("Expected environment 'production', got %s", config.Environment)
	}
	
	if config.LogLevel != "debug" {
		t.Errorf("Expected log level 'debug', got %s", config.LogLevel)
	}
	
	if config.MetricsEnabled {
		t.Error("Expected metrics to be disabled")
	}
}

func TestGetConnectionString(t *testing.T) {
	config := DatabaseConfig{
		Host:     "localhost",
		Port:     5432,
		User:     "testuser",
		Password: "testpass",
		Database: "testdb",
		SSLMode:  "disable",
	}
	
	expected := "host=localhost port=5432 user=testuser password=testpass dbname=testdb sslmode=disable"
	actual := config.GetConnectionString()
	
	if actual != expected {
		t.Errorf("Expected connection string '%s', got '%s'", expected, actual)
	}
}

func TestGetEnvAsDuration(t *testing.T) {
	os.Setenv("TEST_DURATION", "5m")
	defer os.Unsetenv("TEST_DURATION")
	
	duration := getEnvAsDuration("TEST_DURATION", 1*time.Minute)
	expected := 5 * time.Minute
	
	if duration != expected {
		t.Errorf("Expected duration %v, got %v", expected, duration)
	}
	
	// Test with invalid duration
	os.Setenv("TEST_DURATION", "invalid")
	duration = getEnvAsDuration("TEST_DURATION", 1*time.Minute)
	expected = 1 * time.Minute
	
	if duration != expected {
		t.Errorf("Expected default duration %v for invalid input, got %v", expected, duration)
	}
}