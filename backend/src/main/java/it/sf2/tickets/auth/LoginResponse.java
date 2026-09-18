package it.sf2.tickets.auth;

public record LoginResponse(String accessToken, String tokenType, long expiresInSeconds) {}
