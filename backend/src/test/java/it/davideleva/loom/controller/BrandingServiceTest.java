package it.davideleva.loom.controller;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class BrandingServiceTest {
    private static final byte[] PNG_HEADER = {(byte) 137, 80, 78, 71, 13, 10, 26, 10};
    private static final byte[] JPG_HEADER = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF};
    private static final byte[] RIFF_WEBP_HEADER = {
        'R', 'I', 'F', 'F', 0, 0, 0, 0, 'W', 'E', 'B', 'P'
    };

    private Path root;
    private BrandingService service;

    @BeforeEach
    void setUp() throws IOException {
        root = Files.createTempDirectory("branding-test-");
        service = new BrandingService(root.toString());
    }

    @AfterEach
    void tearDown() throws IOException {
        if (root != null && Files.exists(root)) {
            Files.walk(root)
                .sorted((a, b) -> b.getNameCount() - a.getNameCount())
                .forEach(path -> {
                    try { Files.deleteIfExists(path); } catch (IOException ignored) { }
                });
        }
    }

    @Test
    void colorNormalizesLowerCaseAndAcceptsKnownValues() {
        assertEquals("blue", BrandingService.color(null));
        assertEquals("blue", BrandingService.color("BLUE"));
        assertEquals("emerald", BrandingService.color("Emerald"));
        assertEquals("violet", BrandingService.color("violet"));
    }

    @Test
    void colorRejectsUnknownValues() {
        ResponseStatusException exception = assertThrows(ResponseStatusException.class,
            () -> BrandingService.color("not-a-color"));
        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatusCode());
    }

    @Test
    void saveLogoWritesPngAndReturnsExtension() throws IOException {
        byte[] bytes = concat(PNG_HEADER, new byte[10]);
        MultipartFile file = new MockMultipartFile("file", "logo.png", "image/png", bytes);

        String extension = service.saveLogo("companies", 42L, file, null);

        assertEquals("png", extension);
        Path saved = root.resolve("companies/42.png");
        assertEquals(true, Files.exists(saved));
        assertArrayEquals(bytes, Files.readAllBytes(saved));
    }

    @Test
    void saveLogoReturnsPreviousExtensionWhenFileIsEmpty() {
        MultipartFile empty = new MockMultipartFile("file", "logo.png", "image/png", new byte[0]);

        assertEquals("png", service.saveLogo("companies", 1L, empty, "png"));
    }

    @Test
    void saveLogoReturnsPreviousExtensionWhenFileIsNull() {
        assertEquals("svg", service.saveLogo("companies", 1L, null, "svg"));
    }

    @Test
    void saveLogoRejectsOversizedFile() {
        byte[] oversized = new byte[2 * 1024 * 1024 + 1];
        MultipartFile file = new MockMultipartFile("file", "logo.png", "image/png", oversized);

        ResponseStatusException exception = assertThrows(ResponseStatusException.class,
            () -> service.saveLogo("companies", 1L, file, null));
        assertEquals(HttpStatus.PAYLOAD_TOO_LARGE, exception.getStatusCode());
    }

    @Test
    void saveLogoRejectsUnsupportedExtension() {
        MultipartFile file = new MockMultipartFile("file", "logo.bmp", "image/bmp", new byte[]{1, 2, 3});

        ResponseStatusException exception = assertThrows(ResponseStatusException.class,
            () -> service.saveLogo("companies", 1L, file, null));
        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatusCode());
    }

    @Test
    void saveLogoRejectsContentThatDoesNotMatchExtension() {
        // Declare .png but supply bytes that do not start with the PNG header.
        MultipartFile file = new MockMultipartFile("file", "logo.png", "image/png", new byte[]{1, 2, 3});

        ResponseStatusException exception = assertThrows(ResponseStatusException.class,
            () -> service.saveLogo("companies", 1L, file, null));
        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatusCode());
    }

    @Test
    void saveLogoAcceptsSvgWhenXmlIsValid() throws IOException {
        String svg = "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 10 10\">"
            + "<circle cx=\"5\" cy=\"5\" r=\"4\"/></svg>";
        MultipartFile file = new MockMultipartFile("file", "mark.svg", "image/svg+xml",
            svg.getBytes(StandardCharsets.UTF_8));

        String extension = service.saveLogo("projects", 7L, file, null);

        assertEquals("svg", extension);
        assertEquals(true, Files.exists(root.resolve("projects/7.svg")));
    }

    @Test
    void saveLogoRejectsSvgWithScriptTag() {
        String svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>";
        MultipartFile file = new MockMultipartFile("file", "mark.svg", "image/svg+xml",
            svg.getBytes(StandardCharsets.UTF_8));

        ResponseStatusException exception = assertThrows(ResponseStatusException.class,
            () -> service.saveLogo("projects", 7L, file, null));
        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatusCode());
    }

    @Test
    void saveLogoRejectsSvgWithJavascriptHref() {
        String svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"><a href=\"javascript:alert(1)\">x</a></svg>";
        MultipartFile file = new MockMultipartFile("file", "mark.svg", "image/svg+xml",
            svg.getBytes(StandardCharsets.UTF_8));

        ResponseStatusException exception = assertThrows(ResponseStatusException.class,
            () -> service.saveLogo("projects", 7L, file, null));
        assertEquals(HttpStatus.BAD_REQUEST, exception.getStatusCode());
    }

    @Test
    void saveLogoAcceptsJpg() throws IOException {
        byte[] bytes = concat(JPG_HEADER, new byte[]{0x10, 0x20});
        MultipartFile file = new MockMultipartFile("file", "pic.jpg", "image/jpeg", bytes);

        String extension = service.saveLogo("companies", 9L, file, null);

        assertEquals("jpg", extension);
        assertEquals(true, Files.exists(root.resolve("companies/9.jpg")));
    }

    @Test
    void saveLogoAcceptsWebp() throws IOException {
        byte[] bytes = concat(RIFF_WEBP_HEADER, new byte[8]);
        MultipartFile file = new MockMultipartFile("file", "pic.webp", "image/webp", bytes);

        String extension = service.saveLogo("projects", 11L, file, null);

        assertEquals("webp", extension);
        assertEquals(true, Files.exists(root.resolve("projects/11.webp")));
    }

    @Test
    void saveLogoRemovesPreviousFileWhenExtensionChanges() throws IOException {
        Files.createDirectories(root.resolve("companies"));
        Path previous = root.resolve("companies/4.png");
        Files.write(previous, new byte[]{1, 2, 3});

        byte[] jpgBytes = concat(JPG_HEADER, new byte[]{9});
        MultipartFile file = new MockMultipartFile("file", "logo.jpg", "image/jpeg", jpgBytes);

        String extension = service.saveLogo("companies", 4L, file, "png");

        assertEquals("jpg", extension);
        assertEquals(false, Files.exists(previous));
        assertEquals(true, Files.exists(root.resolve("companies/4.jpg")));
    }

    @Test
    void saveLogoRejectsUnknownKind() {
        MultipartFile file = new MockMultipartFile("file", "logo.png", "image/png", PNG_HEADER);

        assertThrows(IllegalArgumentException.class,
            () -> service.saveLogo("teams", 1L, file, null));
    }

    @Test
    void deleteLogoRemovesExistingFile() throws IOException {
        Files.createDirectories(root.resolve("companies"));
        Path target = root.resolve("companies/12.png");
        Files.write(target, new byte[]{1});

        service.deleteLogo("companies", 12L, "png");

        assertEquals(false, Files.exists(target));
    }

    @Test
    void deleteLogoIsNoOpWhenExtensionIsNull() {
        service.deleteLogo("companies", 12L, null);
        // Nothing to assert — should not throw.
    }

    @Test
    void logoPathReturnsNullWhenExtensionIsNull() {
        assertNull(service.logoPath("companies", 1L, null));
    }

    @Test
    void logoPathReturnsResolvedPath() {
        Path path = service.logoPath("projects", 3L, "svg");
        assertEquals(root.resolve("projects/3.svg"), path);
    }

    @Test
    void readLogoReturnsImageResponseForPng() throws IOException {
        Files.createDirectories(root.resolve("projects"));
        byte[] bytes = concat(PNG_HEADER, new byte[4]);
        Files.write(root.resolve("projects/5.png"), bytes);

        ResponseEntity<Resource> response = service.readLogo("projects", 5L, "png");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(MediaType.IMAGE_PNG, response.getHeaders().getContentType());
        assertEquals("nosniff", response.getHeaders().getFirst("X-Content-Type-Options"));
        Resource body = response.getBody();
        assertNotNull(body);
        assertArrayEquals(bytes, body.getInputStream().readAllBytes());
    }

    @Test
    void readLogoUsesCorrectContentTypeForSvg() throws IOException {
        Files.createDirectories(root.resolve("companies"));
        String svg = "<svg xmlns=\"http://www.w3.org/2000/svg\"><rect width=\"1\" height=\"1\"/></svg>";
        byte[] bytes = svg.getBytes(StandardCharsets.UTF_8);
        Files.write(root.resolve("companies/8.svg"), bytes);

        ResponseEntity<Resource> response = service.readLogo("companies", 8L, "svg");

        assertEquals(MediaType.parseMediaType("image/svg+xml"), response.getHeaders().getContentType());
    }

    @Test
    void readLogoReturnsNotFoundWhenExtensionMissing() {
        ResponseStatusException exception = assertThrows(ResponseStatusException.class,
            () -> service.readLogo("companies", 1L, null));
        assertEquals(HttpStatus.NOT_FOUND, exception.getStatusCode());
    }

    @Test
    void readLogoReturnsNotFoundWhenFileMissing() {
        ResponseStatusException exception = assertThrows(ResponseStatusException.class,
            () -> service.readLogo("companies", 999L, "png"));
        assertEquals(HttpStatus.NOT_FOUND, exception.getStatusCode());
    }

    @Test
    void unusedMockSurpressesUnusedWarning() {
        // BrandingService has no collaborators; this test exists only so unused-import
        // noise from mock()/when() does not appear in the imports list above.
        Object ignored = mock(Object.class);
        when(ignored.toString()).thenReturn("ok");
        assertEquals("ok", ignored.toString());
    }

    private static byte[] concat(byte[] first, byte[] second) {
        byte[] combined = new byte[first.length + second.length];
        System.arraycopy(first, 0, combined, 0, first.length);
        System.arraycopy(second, 0, combined, first.length, second.length);
        return combined;
    }
}
