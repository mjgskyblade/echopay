FROM openjdk:17-jdk-slim AS builder

WORKDIR /app

# Copy Maven files
COPY pom.xml .
COPY src/ ./src/

# Install Maven
RUN apt-get update && apt-get install -y maven

# Build the application
RUN mvn clean package -DskipTests

# Final stage
FROM openjdk:17-jre-slim

WORKDIR /app

# Copy the JAR from builder stage
COPY --from=builder /app/target/*.jar app.jar

# Create non-root user
RUN useradd --create-home --shell /bin/bash echopay
RUN chown -R echopay:echopay /app
USER echopay

# Expose port
EXPOSE 8005

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8005/health || exit 1

# Run the application
CMD ["java", "-jar", "app.jar"]