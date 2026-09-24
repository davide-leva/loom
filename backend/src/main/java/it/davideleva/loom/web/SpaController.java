package it.davideleva.loom.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class SpaController {
    @GetMapping({
        "/",
        "/setup",
        "/login",
        "/dashboard",
        "/eventi",
        "/preferenze-email",
        "/anomalie",
        "/migliorie",
        "/implementazioni",
        "/pianificazione",
        "/eliminate",
        "/archivio",
        "/configurazione",
        "/configurazione/progetti",
        "/configurazione/compagnie",
        "/configurazione/team-users",
        "/configurazione/campi-segnalazione",
        "/configurazione/autenticazione-esterna"
    })
    String index() {
        return "forward:/index.html";
    }
}
