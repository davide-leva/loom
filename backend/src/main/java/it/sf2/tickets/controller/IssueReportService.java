package it.sf2.tickets.controller;

import it.sf2.tickets.domain.Issue;
import it.sf2.tickets.domain.IssueStatus;
import it.sf2.tickets.domain.IssueType;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collections;
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

/**
 * Generates the printable issue report. Each tipologia (issue type) plus the dedicated
 * "Rifiutati" (soft-deleted) section are rendered as separate groups; pages are A4 portrait,
 * text is word-wrapped inside each cell, and the row height adapts to the tallest cell.
 */
@Service
@Slf4j
public class IssueReportService {
    /** A4 portrait orientation (width 595.27pt × height 841.89pt). */
    private static final PDRectangle PAGE_SIZE = PDRectangle.A4;
    private static final float MARGIN = 36;
    private static final float HEADER_PAD = 14;
    private static final float CELL_PAD = 6;
    private static final float LINE_HEIGHT = 12;
    private static final float SECTION_GAP = 12;
    private static final float TITLE_GAP = 16;
    private static final float HEADING_HEIGHT = 22;
    private static final float FOOTER_GAP = 18;
    /** Column widths sum to {@code ~523pt} = page width (595.27) − 2 × MARGIN (36). */
    private static final float[] WIDTHS = {32, 200, 62, 70, 100, 59};
    private static final String[] HEADERS = {"ID", "Titolo", "Stato", "Tipologia", "Segnalatore", "Data"};
    private static final PDFont REGULAR = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
    private static final PDFont BOLD = new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);
    private static final DateTimeFormatter DATE_FORMAT = DateTimeFormatter.ofPattern("dd/MM/yyyy")
        .withZone(ZoneId.systemDefault());

    public record Section(String title, List<Issue> issues) {}

    public byte[] generate(String projectName, List<Section> sections, List<String> activeFilters) {
        try (PDDocument document = new PDDocument(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            PageWriter writer = new PageWriter(document);
            writer.openPage();
            writer.writeHeader(projectName, sections, activeFilters);

            boolean anyRow = false;
            for (Section section : sections) {
                if (section.issues().isEmpty()) continue;
                anyRow = true;
                writer.writeSection(section);
            }

            if (!anyRow) {
                writer.ensureSpace(2 * LINE_HEIGHT);
                writer.text("Nessuna segnalazione corrisponde ai filtri selezionati.", MARGIN, writer.y - LINE_HEIGHT, 10, REGULAR);
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

    /**
     * Splits {@code value} into lines that each fit within {@code maxWidth} when rendered with
     * {@code font} at {@code fontSize}. Words that themselves exceed {@code maxWidth} are
     * truncated with an ellipsis.
     */
    private static List<String> wrapText(String value, PDFont font, float fontSize, float maxWidth) throws IOException {
        String text = pdfText(value == null ? "" : value);
        if (text.isBlank()) return Collections.singletonList("");
        if (textWidth(text, font, fontSize) <= maxWidth) return Collections.singletonList(text);

        List<String> lines = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (String word : text.split("\\s+")) {
            String candidate = current.length() == 0 ? word : current + " " + word;
            if (textWidth(candidate, font, fontSize) <= maxWidth) {
                current = new StringBuilder(candidate);
                continue;
            }
            if (current.length() > 0) {
                lines.add(current.toString());
                current = new StringBuilder();
            }
            if (textWidth(word, font, fontSize) <= maxWidth) {
                current = new StringBuilder(word);
            } else {
                lines.add(truncate(word, font, fontSize, maxWidth));
            }
        }
        if (current.length() > 0) lines.add(current.toString());
        return lines;
    }

    private static float textWidth(String text, PDFont font, float fontSize) throws IOException {
        return font.getStringWidth(text) / 1000f * fontSize;
    }

    private static String truncate(String value, PDFont font, float fontSize, float maxWidth) throws IOException {
        String safe = pdfText(value == null ? "" : value);
        if (textWidth(safe, font, fontSize) <= maxWidth) return safe;
        String suffix = "...";
        int end = safe.length();
        while (end > 0 && textWidth(safe.substring(0, end) + suffix, font, fontSize) > maxWidth) end--;
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

    private static float tableWidth() {
        float width = 0;
        for (float column : WIDTHS) width += column;
        return width;
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

        private void newPage() throws IOException {
            closePage();
            openPage();
        }

        private void writeHeader(String projectName, List<Section> sections, List<String> activeFilters) throws IOException {
            text("Report segnalazioni", MARGIN, y, 18, BOLD);
            y -= TITLE_GAP + 4;
            text("Progetto: " + projectName, MARGIN, y, 11, BOLD);
            y -= TITLE_GAP;
            int totalIssues = sections.stream().mapToInt(s -> s.issues().size()).sum();
            text("Generato il " + DATE_FORMAT.format(java.time.Instant.now())
                + " · Totale: " + totalIssues, MARGIN, y, 9, REGULAR);
            y -= LINE_HEIGHT + 2;
            String filterText = activeFilters.isEmpty()
                ? "Filtri: nessuno"
                : "Filtri: " + String.join(" · ", activeFilters);
            text(truncate(filterText, REGULAR, 8, PAGE_SIZE.getWidth() - MARGIN * 2), MARGIN, y, 8, REGULAR);
            y -= FOOTER_GAP;
        }

        private void writeSection(Section section) throws IOException {
            ensureSpace(HEADING_HEIGHT + HEADER_PAD);
            fill(0.94f, 0.96f, 0.99f, MARGIN, y - HEADING_HEIGHT, tableWidth(), HEADING_HEIGHT);
            text(section.title(), MARGIN + CELL_PAD, y - HEADING_HEIGHT + 6, 12, BOLD);
            y -= HEADING_HEIGHT;
            ensureSpace(HEADER_PAD);
            writeTableHeader();

            for (Issue issue : section.issues()) {
                writeRow(issue);
            }
            y -= SECTION_GAP;
        }

        private void writeTableHeader() throws IOException {
            ensureSpace(HEADER_PAD);
            fill(0.91f, 0.94f, 0.97f, MARGIN, y - HEADER_PAD, tableWidth(), HEADER_PAD);
            float x = MARGIN;
            for (int index = 0; index < HEADERS.length; index++) {
                text(HEADERS[index], x + 4, y - 10, 8, BOLD);
                x += WIDTHS[index];
            }
            line(MARGIN, y - HEADER_PAD, MARGIN + tableWidth(), y - HEADER_PAD);
            y -= HEADER_PAD;
        }

        private void writeRow(Issue issue) throws IOException {
            String[] values = {
                "#" + issue.getId(), issue.getTitle(), statusLabel(issue.getStatus()),
                typeLabel(issue.getIssueType()), username(issue.getIssuer()),
                DATE_FORMAT.format(issue.getCreatedAt())
            };
            List<List<String>> cellLines = new ArrayList<>(values.length);
            int maxLines = 1;
            for (int i = 0; i < values.length; i++) {
                List<String> lines = wrapText(values[i], REGULAR, 8, WIDTHS[i] - 8);
                cellLines.add(lines);
                maxLines = Math.max(maxLines, lines.size());
            }
            float rowHeight = CELL_PAD + maxLines * LINE_HEIGHT + 4;

            ensureSpace(rowHeight);

            if (issue.isDeleted()) {
                fill(1f, 0.92f, 0.92f, MARGIN, y - rowHeight, tableWidth(), rowHeight);
            } else if (issue.isInternal()) {
                fill(0.86f, 0.93f, 1f, MARGIN, y - rowHeight, tableWidth(), rowHeight);
            }

            float x = MARGIN;
            for (int i = 0; i < values.length; i++) {
                List<String> lines = cellLines.get(i);
                float textX = x + 4;
                float baselineY = y - CELL_PAD - 4;
                for (int li = 0; li < lines.size(); li++) {
                    text(lines.get(li), textX, baselineY - li * LINE_HEIGHT, 8, REGULAR);
                }
                x += WIDTHS[i];
            }

            line(MARGIN, y - rowHeight, MARGIN + tableWidth(), y - rowHeight);
            y -= rowHeight;
        }

        private void ensureSpace(float height) throws IOException {
            if (y - height >= MARGIN) return;
            newPage();
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
    }
}
