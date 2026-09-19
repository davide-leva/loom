package it.sf2.tickets.controller;

import java.io.IOException;
import java.io.ByteArrayInputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.util.Arrays;
import java.util.Locale;
import java.util.Set;
import javax.xml.XMLConstants;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Node;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.Resource;
import org.springframework.core.io.UrlResource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import lombok.extern.slf4j.Slf4j;

@Service
@Slf4j
public class BrandingService {
    private static final int MAX_LOGO_BYTES = 2 * 1024 * 1024;
    private static final Set<String> COLORS = Set.of(
        "emerald", "green", "lime", "red", "orange", "amber", "yellow", "teal", "cyan",
        "sky", "blue", "indigo", "violet", "purple", "fuchsia", "pink", "rose",
        "slate", "gray", "zinc", "neutral", "stone"
    );
    private final Path root;

    public BrandingService(@Value("${app.branding.root-folder}") String rootFolder) {
        root = Paths.get(rootFolder).toAbsolutePath().normalize();
    }

    public static String color(String value) {
        String result = value == null ? "blue" : value.toLowerCase(Locale.ROOT);
        if (!COLORS.contains(result)) throw ApiLookup.badRequest("Unsupported primary color");
        return result;
    }

    public String saveLogo(String kind, long id, MultipartFile file, String previousExtension) {
        if (file == null || file.isEmpty()) return previousExtension;
        if (file.getSize() > MAX_LOGO_BYTES) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Logo exceeds 2 MB");
        }
        String filename = file.getOriginalFilename();
        String extension = filename == null || !filename.contains(".") ? ""
            : filename.substring(filename.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        if (!Set.of("png", "jpg", "jpeg", "webp", "svg").contains(extension)) {
            throw ApiLookup.badRequest("Logo must be PNG, JPEG, WebP or SVG");
        }
        try {
            byte[] bytes = file.getBytes();
            if (bytes.length == 0 || bytes.length > MAX_LOGO_BYTES || !matchesFormat(bytes, extension)) {
                throw ApiLookup.badRequest("Logo content does not match its file extension");
            }
            Path folder = folder(kind);
            Files.createDirectories(folder);
            Path temporary = Files.createTempFile(folder, id + "-", ".tmp");
            try {
                Files.write(temporary, bytes);
                Files.move(temporary, path(kind, id, extension), StandardCopyOption.REPLACE_EXISTING);
            } finally {
                Files.deleteIfExists(temporary);
            }
            if (previousExtension != null && !previousExtension.equals(extension)) {
                Files.deleteIfExists(path(kind, id, previousExtension));
            }
            return extension;
        } catch (IOException exception) {
            log.error("Cannot store logo in {}", root.resolve(kind), exception);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Cannot store logo", exception);
        }
    }

    public void deleteLogo(String kind, long id, String extension) {
        if (extension == null) return;
        try {
            Files.deleteIfExists(path(kind, id, extension));
        } catch (IOException exception) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Cannot delete logo", exception);
        }
    }

    public Path logoPath(String kind, long id, String extension) {
        return extension == null ? null : path(kind, id, extension);
    }

    public ResponseEntity<Resource> readLogo(String kind, long id, String extension) {
        if (extension == null) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Logo not found");
        Path path = path(kind, id, extension);
        Resource resource;
        try {
            resource = new UrlResource(path.toUri());
        } catch (Exception exception) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Logo not found", exception);
        }
        if (!resource.exists() || !resource.isReadable()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Logo not found");
        }
        MediaType mediaType = switch (extension) {
            case "png" -> MediaType.IMAGE_PNG;
            case "jpg", "jpeg" -> MediaType.IMAGE_JPEG;
            case "svg" -> MediaType.parseMediaType("image/svg+xml");
            default -> MediaType.parseMediaType("image/webp");
        };
        return ResponseEntity.ok().contentType(mediaType).cacheControl(CacheControl.noStore())
            .header("X-Content-Type-Options", "nosniff")
            .header("Content-Security-Policy", "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data:")
            .body(resource);
    }

    private Path folder(String kind) {
        if (!kind.equals("companies") && !kind.equals("projects")) throw new IllegalArgumentException("Unknown logo kind");
        return root.resolve(kind);
    }

    private Path path(String kind, long id, String extension) {
        return folder(kind).resolve(id + "." + extension);
    }

    private static boolean matchesFormat(byte[] bytes, String extension) {
        return switch (extension) {
            case "png" -> bytes.length >= 8 && Arrays.equals(Arrays.copyOf(bytes, 8),
                new byte[]{(byte) 137, 80, 78, 71, 13, 10, 26, 10});
            case "jpg", "jpeg" -> bytes.length >= 3 && (bytes[0] & 255) == 255
                && (bytes[1] & 255) == 216 && (bytes[2] & 255) == 255;
            case "webp" -> bytes.length >= 12 && new String(bytes, 0, 4).equals("RIFF")
                && new String(bytes, 8, 4).equals("WEBP");
            case "svg" -> validSvg(bytes);
            default -> false;
        };
    }

    private static boolean validSvg(byte[] bytes) {
        try {
            var factory = DocumentBuilderFactory.newInstance();
            factory.setNamespaceAware(true);
            factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
            factory.setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true);
            factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
            factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
            factory.setXIncludeAware(false);
            factory.setExpandEntityReferences(false);
            var document = factory.newDocumentBuilder().parse(new ByteArrayInputStream(bytes));
            if (!"svg".equals(document.getDocumentElement().getLocalName())
                || !"http://www.w3.org/2000/svg".equals(document.getDocumentElement().getNamespaceURI())) {
                return false;
            }
            var elements = document.getElementsByTagName("*");
            for (int i = 0; i < elements.getLength(); i++) {
                Node element = elements.item(i);
                String name = element.getLocalName();
                if (Set.of("script", "foreignObject", "style", "iframe", "object", "embed").contains(name)) return false;
                var attributes = element.getAttributes();
                for (int j = 0; j < attributes.getLength(); j++) {
                    Node attribute = attributes.item(j);
                    String attributeName = attribute.getLocalName().toLowerCase(Locale.ROOT);
                    String value = attribute.getNodeValue().toLowerCase(Locale.ROOT).trim();
                    if (attributeName.startsWith("on") || value.contains("javascript:") || value.contains("@import")
                        || (attributeName.equals("href") && !value.isEmpty() && !value.startsWith("#"))) {
                        return false;
                    }
                }
            }
            return true;
        } catch (Exception exception) {
            return false;
        }
    }
}
