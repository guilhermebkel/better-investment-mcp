# OCR of scanned pages and tables of PDFs

Date: 2026-11-09.

Some filings are scanned images with no text layer, and their tables are lost when the text is read as a flat stream. Text read with unpdf is kept, but the pages without text were only counted.

## Decision

- Pages with no text are read by OCR: OCRmyPDF with `--skip-text` (pages that already have text stay as they are), languages `por+eng`. The bytes go to OCRmyPDF through its standard input and output, so no file is written by the server.
- The tables of each page are read by PyMuPDF (`find_tables`) from the native structure of the PDF. Each table is one chunk with section `table`.
- Running the server, the tools are optional: they are named by `INVESTMENT_MCP_OCRMYPDF` and `INVESTMENT_MCP_PYTHON`, and when one is missing or fails, the document keeps the text it has; the pages without text are counted and reported in the answer.
- Installing them is required: `pnpm ensure-deps` fails when a tool is missing, and the Dockerfile installs them. So, when installed, they are used by default: OCR on the pages without text, and the table reading on every PDF.
- PyMuPDF is licensed under AGPL. The owner accepted it for this project.

## Consequences

- The server runs two programs outside Node: `ocrmypdf` (with Tesseract) and a Python with PyMuPDF. Each is installed by the operator; the image and `npx` installs do not include them yet.
- The text of a table is kept in the page text as well, so a number in a table can be found twice.
- OCR of a long scanned filing can take minutes; the load runs in the background (ADR 0022).
- Only the native tables are read. A scanned table is read as text by OCR, without its structure.
