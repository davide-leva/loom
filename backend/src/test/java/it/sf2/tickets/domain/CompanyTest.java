package it.sf2.tickets.domain;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class CompanyTest {

    @Test
    void singleArgConstructorPopulatesNameAndDefaults() {
        Company company = new Company("Acme");
        assertEquals("Acme", company.getName());
        assertFalse(company.isTeamCompany());
        assertEquals("blue", company.getPrimaryColor());
        assertNull(company.getLogoExtension());
    }

    @Test
    void twoArgConstructorPopulatesNameAndTeamCompanyFlag() {
        Company company = new Company("Acme", true);
        assertEquals("Acme", company.getName());
        assertTrue(company.isTeamCompany());
        assertEquals("blue", company.getPrimaryColor());
    }

    @Test
    void teamCompanyFlagRoundTrips() {
        Company company = new Company("Acme");
        assertFalse(company.isTeamCompany());
        company.setTeamCompany(true);
        assertTrue(company.isTeamCompany());
        company.setTeamCompany(false);
        assertFalse(company.isTeamCompany());
    }

    @Test
    void primaryColorRoundTrips() {
        Company company = new Company("Acme");
        assertEquals("blue", company.getPrimaryColor());
        company.setPrimaryColor("red");
        assertEquals("red", company.getPrimaryColor());
    }

    @Test
    void logoExtensionRoundTrips() {
        Company company = new Company("Acme");
        assertNull(company.getLogoExtension());
        company.setLogoExtension("png");
        assertEquals("png", company.getLogoExtension());
    }

    @Test
    void idIsSettableViaReflection() {
        Company company = new Company("Acme");
        ReflectionTestUtils.setField(company, "id", 50L);
        assertEquals(50L, company.getId());
    }
}
