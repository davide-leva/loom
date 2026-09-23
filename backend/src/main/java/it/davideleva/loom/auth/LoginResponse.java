package it.davideleva.loom.auth;

public record LoginResponse(String accessToken, String tokenType, long expiresInSeconds) {}
