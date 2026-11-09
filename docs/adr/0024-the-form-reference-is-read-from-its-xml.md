# The reference form is read from the PDFs inside its XML

Date: 2026-11-09.

## Context

A company files its reference form (FRE) as a zip with one XML. The structured fields are in the XML (they are kept in `asset_filing_items`), and the narrative text (activities, risk factors, board comments, remuneration) is in 78 to 82 PDFs embedded in that XML as base64. The PDF path of the document loader cannot read the zip, and the link of the form in CVM's table is an `http` URL that the loader refuses.

## Decision

- The document loader accepts the form zip as well as a PDF. The format is read from the bytes.
- The text comes from the PDFs inside the XML, read page by page with the PDF reader the store already uses. Each chunk's `section` is the form section and the item number (`FatoresRisco 4.1`), and its `page` is the page of that item's PDF.
- A blank slot of the form (an empty name and an empty PDF) is skipped; it holds no document.
- The XML is decoded as cp1252, although it declares UTF-8. Item names are the one place where CVM writes UTF-8 inside it, and they are repaired on read.
- The form links are stored as https, the only scheme the document host answers.
- Only the highest version of each reference form is stored. Each version is a complete form, so the newest one is enough and the others are not merged.

## Consequences

- A search on a section name alone does not match a form item: `search_chunks` filters the section by exact name, so the item label is part of the name. The guide and the data map say so.
- The form's structured fields stay in `asset_filing_items`; the text is in `asset_filing_chunks`.
- A form zip that holds no XML, or an XML with no item, is refused by name and nothing is stored.
