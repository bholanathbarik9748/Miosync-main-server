# Authentication API Setup Guide

## Overview
This project implements a complete authentication system using TypeORM, JWT, and Passport.js with a PostgreSQL database.

## Features
- User registration with email and password
- User login with JWT token generation
- Protected routes using JWT authentication
- Password hashing using bcrypt
- User profile retrieval
- API versioning (v2) for better maintainability

## API Endpoints

### 1. Register User
```
POST /api/v2/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe"
}
```

### 2. Login User
```
POST /api/v2/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

### 3. Get User Profile (Protected)
```
GET /api/v2/auth/profile
Authorization: Bearer <jwt_token>
```

## Environment Variables
Create a `.env` file in the root directory with the following variables:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_password
DB_DATABASE=miosync_db

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# Server Configuration
PORT=3000
```

## Database Setup
1. Create a PostgreSQL database
2. Update the environment variables with your database credentials
3. The application will automatically create the `user` table on startup

## Running the Application
```bash
npm run dev
```

## Testing the API
You can test the endpoints using curl or any API client like Postman:

### Register a new user:
```bash
curl -X POST http://localhost:3000/api/v2/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "firstName": "John",
    "lastName": "Doe"
  }'
```

### Login:
```bash
curl -X POST http://localhost:3000/api/v2/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### Get profile (use the token from login response):
```bash
curl -X GET http://localhost:3000/api/v2/auth/profile \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"
```

## Security Features
- Passwords are hashed using bcrypt with salt rounds of 10
- JWT tokens expire after 24 hours
- Email addresses must be unique
- Input validation using class-validator
- Protected routes require valid JWT tokens
