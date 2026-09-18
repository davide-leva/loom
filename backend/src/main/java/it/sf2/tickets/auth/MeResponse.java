package it.sf2.tickets.auth;

public record MeResponse(long id, String username, String email, String role, String companyName) {}
