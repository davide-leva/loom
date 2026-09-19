package it.sf2.tickets.controller;

import it.sf2.tickets.domain.Issue;
import it.sf2.tickets.domain.IssueStatus;
import it.sf2.tickets.domain.IssueType;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import lombok.extern.slf4j.Slf4j;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;
import org.apache.pdfbox.pdmodel.graphics.color.PDColor;
import org.apache.pdfbox.pdmodel.graphics.color.PDDeviceRGB;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
@Slf4j
public class IssueReportService {
    private static final PDRectangle PAGE_SIZE = new PDRectangle(PDRectangle.A4.getHeight(), PDRectangle.A4.getWidth());
    private static final float MARGIN = 36;
    private static final float ROW_HEIGHT = 22;
    private static final float[] WIDTHS = {36, 194, 72, 80, 90, 90, 78, 58};
    private static final String[] HEADERS = {"ID", "Titolo", "Stato", "Tipologia", "Segnalatore",
        "Sviluppatore", "Data", "Visibilità"};
    private static final PDFont REGULAR = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
    private static final PDFont BOLD = new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);
    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm")
        .withZone(ZoneId.systemDefault());

    public byte[] generate(String projectName, List<Issue> issues, List<String> activeFilters) {
        try (PDDocument document = new PDDocument(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            PageWriter writer = new PageWriter(document);
            writer.openPage();
            writer.text("Report segnalazioni", MARGIN, writer.y, 18, BOLD);
            writer.y -= 22;
            writer.text("Progetto: " + projectName, MARGIN, writer.y, 11, BOLD);
            writer.y -= 16;
            writer.text("Generato il " + DATE_FORMAT.format(java.time.Instant.now()) + " · Totale: " + issues.size(),
                MARGIN, writer.y, 9, REGULAR);
            writer.y -= 15;
            writer.text(truncate(activeFilters.isEmpty() ? "Filtri: nessuno" : "Filtri: " + String.join(" · ", activeFilters),
                REGULAR, 8, PAGE_SIZE.getWidth() - MARGIN * 2), MARGIN, writer.y, 8, REGULAR);
            writer.y -= 20;
            writer.tableHeader();

            for (Issue issue : issues) {
                if (writer.y - ROW_HEIGHT < MARGIN) {
                    writer.closePage();
                    writer.openPage();
                    writer.tableHeader();
                }
                writer.row(issue);
            }
            if (issues.isEmpty()) {
                writer.text("Nessuna segnalazione corrisponde ai filtri selezionati.", MARGIN, writer.y - 18, 10, REGULAR);
            }
            writer.closePage();
            document.save(output);
            return output.toByteArray();
        } catch (IOException | IllegalArgumentException exception) {
            log.error("Issue report generation failed for project={}", projectName, exception);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Cannot generate issue report", exception);
        }
    }

    private static String statusLabel(IssueStatus status) {
        return switch (status) {
            case REPORTED -> "Segnalato";
            case IN_PROGRESS -> "In lavorazione";
            case COMPLETED -> "Completato";
            case RELEASED -> "Rilasciato";
            case APPROVED -> "Approvato";
        };
    }

    private static String typeLabel(IssueType type) {
        if (type == null) return "Non categorizzata";
        return switch (type) {
            case ANOMALY -> "Anomalia";
            case IMPROVEMENT -> "Miglioria";
            case IMPLEMENTATION -> "Implementazione";
        };
    }

    private static String username(it.sf2.tickets.domain.User user) {
        return user == null ? "Non assegnato" : user.getUsername();
    }

    private static String truncate(String value, PDFont font, float fontSize, float maxWidth) throws IOException {
        String safe = pdfText(value == null ? "" : value);
        if (font.getStringWidth(safe) / 1000 * fontSize <= maxWidth) return safe;
        String suffix = "...";
        int end = safe.length();
        while (end > 0 && font.getStringWidth(safe.substring(0, end) + suffix) / 1000 * fontSize > maxWidth) end--;
        return safe.substring(0, end) + suffix;
    }

    private static String pdfText(String value) throws IOException {
        StringBuilder output = new StringBuilder(value.length());
        for (char character : value.replace('\n', ' ').replace('\r', ' ').toCharArray()) {
            try {
                REGULAR.encode(String.valueOf(character));
                output.append(character);
            } catch (IllegalArgumentException exception) {
                output.append('?');
            }
        }
        return output.toString();
    }

    private static final class PageWriter {
        private final PDDocument document;
        private PDPageContentStream content;
        private float y;

        private PageWriter(PDDocument document) {
            this.document = document;
        }

        private void openPage() throws IOException {
            PDPage page = new PDPage(PAGE_SIZE);
            document.addPage(page);
            content = new PDPageContentStream(document, page);
            y = PAGE_SIZE.getHeight() - MARGIN;
        }

        private void closePage() throws IOException {
            if (content != null) content.close();
            content = null;
        }

        private void tableHeader() throws IOException {
            fill(0.91f, 0.94f, 0.97f, MARGIN, y - ROW_HEIGHT, tableWidth(), ROW_HEIGHT);
            float x = MARGIN;
            for (int index = 0; index < HEADERS.length; index++) {
                text(HEADERS[index], x + 4, y - 15, 8, BOLD);
                x += WIDTHS[index];
            }
            line(MARGIN, y - ROW_HEIGHT, MARGIN + tableWidth(), y - ROW_HEIGHT);
            y -= ROW_HEIGHT;
        }

        private void row(Issue issue) throws IOException {
            if (issue.isInternal()) fill(0.86f, 0.93f, 1f, MARGIN, y - ROW_HEIGHT, tableWidth(), ROW_HEIGHT);
            String[] values = {
                "#" + issue.getId(), issue.getTitle(), statusLabel(issue.getStatus()), typeLabel(issue.getIssueType()),
                username(issue.getIssuer()), username(issue.getDeveloper()), DATE_FORMAT.format(issue.getCreatedAt()),
                issue.isInternal() ? "Interna" : "Pubblica"
            };
            float x = MARGIN;
            for (int index = 0; index < values.length; index++) {
                text(truncate(values[index], REGULAR, 8, WIDTHS[index] - 8), x + 4, y - 15, 8, REGULAR);
                x += WIDTHS[index];
            }
            line(MARGIN, y - ROW_HEIGHT, MARGIN + tableWidth(), y - ROW_HEIGHT);
            y -= ROW_HEIGHT;
        }

        private void text(String value, float x, float baseline, float size, PDFont font) throws IOException {
            content.beginText();
            content.setFont(font, size);
            content.newLineAtOffset(x, baseline);
            content.showText(pdfText(value));
            content.endText();
        }

        private void fill(float red, float green, float blue, float x, float y, float width, float height) throws IOException {
            content.setNonStrokingColor(new PDColor(new float[]{red, green, blue}, PDDeviceRGB.INSTANCE));
            content.addRect(x, y, width, height);
            content.fill();
            content.setNonStrokingColor(0f);
        }

        private void line(float fromX, float fromY, float toX, float toY) throws IOException {
            content.setStrokingColor(0.82f);
            content.setLineWidth(0.4f);
            content.moveTo(fromX, fromY);
            content.lineTo(toX, toY);
            content.stroke();
        }

        private static float tableWidth() {
            float width = 0;
            for (float column : WIDTHS) width += column;
            return width;
        }
    }
}
