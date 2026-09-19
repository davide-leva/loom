package it.sf2.tickets.auth;

public record MeResponse(long id, String username, String displayName, String email, String role,
                         String companyName,  Long companyId, String primaryColor,
                         String companyLogoUrl, String internalCompanyName, String internalLogoUrl) {}
