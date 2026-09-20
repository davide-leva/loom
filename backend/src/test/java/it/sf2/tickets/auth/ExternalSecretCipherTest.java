package it.sf2.tickets.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Base64;
import org.junit.jupiter.api.Test;

class ExternalSecretCipherTest {
    private final ExternalSecretCipher cipher = new ExternalSecretCipher("test-app-secret");

    @Test
    void roundtripAscii() {
        String plain = "hello-world";
        assertEquals(plain, cipher.decrypt(cipher.encrypt(plain)));
    }

    @Test
    void roundtripEmptyString() {
        String plain = "";
        assertEquals(plain, cipher.decrypt(cipher.encrypt(plain)));
    }

    @Test
    void roundtripUtf8SpecialCharacters() {
        String plain = "Ciao è una stringa con àccènti e 中文字符 e emoji 😀";
        assertEquals(plain, cipher.decrypt(cipher.encrypt(plain)));
    }

    @Test
    void roundtripLongString() {
        StringBuilder builder = new StringBuilder();
        for (int i = 0; i < 5000; i++) {
            builder.append("abcdefghij");
        }
        String plain = builder.toString();
        assertEquals(plain, cipher.decrypt(cipher.encrypt(plain)));
    }

    @Test
    void twoEncryptionsOfSamePlaintextProduceDifferentCiphertexts() {
        String plain = "same-secret-value";
        String first = cipher.encrypt(plain);
        String second = cipher.encrypt(plain);
        assertNotEquals(first, second, "Random IV should make ciphertexts differ");
        assertEquals(plain, cipher.decrypt(first));
        assertEquals(plain, cipher.decrypt(second));
    }

    @Test
    void encryptedPayloadIsBase64() {
        String encrypted = cipher.encrypt("a");
        // base64 round-trip should succeed without errors
        byte[] decoded = Base64.getDecoder().decode(encrypted);
        assertTrue(decoded.length > 0, "decoded bytes must be non-empty");
    }

    @Test
    void decryptOfGarbageThrowsIllegalStateException() {
        assertThrows(IllegalStateException.class, () -> cipher.decrypt("not-base64-!!!"));
    }

    @Test
    void decryptOfEmptyStringThrows() {
        assertThrows(IllegalStateException.class, () -> cipher.decrypt(""));
    }
}
