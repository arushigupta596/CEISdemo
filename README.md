# CEIS Document Intelligence

A loan package document analysis system built for **Critical Energy Infrastructure Services (CEIS)** loan review workflow.

## What it does

- **Ingests** any loan package file (PDF, DOCX, XLSX, TXT)
- **Classifies** each document against CEIS document types using keyword scoring
- **Maps** files against the official CEIS Credit File Inventory List (CRE, C&I, Residential, Leveraged Loan)
- **Generates** a structured completeness and exception report with `E` flags for missing required documents

## Getting Started

```bash
npm install
npm run dev
```

## Tech Stack

- React 18 (hooks: useState, useCallback, useRef)
- Vite
- Pure inline CSS — no component libraries
- FileReader API for client-side file reading
- Keyword scoring engine derived from the CEIS Credit File Inventory List PDF

## Loan Types Supported

| Type | Items |
|------|-------|
| CRE (Commercial Real Estate) | 10 |
| C&I (Commercial & Industrial) | 10 |
| Residential | 18 |
| Leveraged Loan | 12 |

## Exception Reporting

Follows CEIS Standard Guidance — missing required documents are flagged as **Exception (E)**. Exception levels reported as Low / Normal-Medium / High (25% / 30% thresholds).
